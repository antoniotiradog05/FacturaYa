const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const { generateInvoicePdf } = require('./pdf_service');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ALLOWED_STATUSES = new Set(['PENDING', 'PAID', 'CANCELLED']);

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const calculateInvoiceTotals = (items, vatRate, irpfRate, discountRate = 0) => {
  const grossSubtotal = round2(items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0));
  const discountAmount = round2(grossSubtotal * (discountRate / 100));
  const subtotal = round2(grossSubtotal - discountAmount);
  
  const vat = round2(subtotal * (vatRate / 100));
  const irpf = round2(subtotal * (irpfRate / 100));
  const total = round2(subtotal + vat - irpf);
  return { grossSubtotal, discountAmount, subtotal, vat, irpf, total };
};

const sanitizeItems = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('La factura debe tener al menos un concepto.');
  }

  return items.map((item, index) => {
    const description = String(item.description || '').trim();
    const quantity = asNumber(item.quantity, 0);
    const unit_price = asNumber(item.unit_price, 0);

    if (!description) {
      throw new Error(`El concepto #${index + 1} no tiene descripcion.`);
    }
    if (quantity <= 0) {
      throw new Error(`La cantidad del concepto #${index + 1} debe ser mayor que 0.`);
    }
    if (unit_price < 0) {
      throw new Error(`El precio del concepto #${index + 1} no puede ser negativo.`);
    }

    return {
      description,
      quantity,
      unit_price,
      total: round2(quantity * unit_price)
    };
  });
};

const tryHandler = (handler) => (req, res, next) => {
  try {
    const result = handler(req, res, next);
    if (result && typeof result.then === 'function') {
      result.catch(next);
    }
  } catch (error) {
    next(error);
  }
};

// --- CLIENTS API ---
app.get('/api/clients', tryHandler((req, smugglers) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY name ASC').all();
  smugglers.json(clients);
}));

app.post('/api/clients', tryHandler((req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const tax_id = String(req.body.tax_id || '').trim();
  const address = String(req.body.address || '').trim();

  if (!name) {
    return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
  }

  const info = db.prepare(`
    INSERT INTO clients (name, email, tax_id, address)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      email = excluded.email,
      tax_id = excluded.tax_id,
      address = excluded.address
  `).run(name, email || null, tax_id || null, address || null);

  const client = db.prepare('SELECT id FROM clients WHERE name = ?').get(name);
  res.status(201).json({ id: client?.id || info.lastInsertRowid });
}));

app.delete('/api/clients/:id', tryHandler((req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  if (!info.changes) {
    return res.status(404).json({ error: 'Cliente no encontrado.' });
  }
  res.json({ success: true });
}));

// --- INVOICES API ---
app.get('/api/invoices', tryHandler((req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, c.name as client_name 
    FROM invoices i 
    JOIN clients c ON i.client_id = c.id 
    ORDER BY i.date DESC, i.number DESC
  `).all();

  const enrichedInvoices = invoices.map((inv) => {
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
    const totals = calculateInvoiceTotals(items, inv.vat_rate, inv.irpf_rate);
    return { ...inv, items, ...totals };
  });

  res.json(enrichedInvoices);
}));

app.get('/api/invoices/:id', tryHandler((req, res) => {
  const invoice = db.prepare(`
    SELECT i.*, c.name as client_name 
    FROM invoices i 
    JOIN clients c ON i.client_id = c.id 
    WHERE i.id = ?
  `).get(req.params.id);

  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada.' });

  invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
  res.json(invoice);
}));

app.put('/api/invoices/:id', tryHandler((req, res) => {
  const id = req.params.id;
  const number = String(req.body.number || '').trim();
  const client_name = String(req.body.client_name || '').trim();
  const date = String(req.body.date || '').trim();
  const due_date = String(req.body.due_date || '').trim();
  const discount_rate = asNumber(req.body.discount_rate, 0);
  const vat_rate = asNumber(req.body.vat_rate, 21);
  const irpf_rate = asNumber(req.body.irpf_rate, 15);
  const status = String(req.body.status || 'PENDING').toUpperCase();
  const notes = String(req.body.notes || '').trim();

  if (!number || !client_name || !date) {
    return res.status(400).json({ error: 'Numero, cliente y fecha son obligatorios.' });
  }

  const cleanItems = sanitizeItems(req.body.items);
  const totals = calculateInvoiceTotals(cleanItems, vat_rate, irpf_rate, discount_rate);

  const updateInvoice = db.transaction(() => {
    let client = db.prepare('SELECT id FROM clients WHERE name = ?').get(client_name);
    let clientId = client?.id;
    if (!clientId) {
      const clientResult = db.prepare('INSERT INTO clients (name) VALUES (?)').run(client_name);
      clientId = clientResult.lastInsertRowid;
    }

    db.prepare(`
      UPDATE invoices SET
        number = ?, client_id = ?, date = ?, due_date = ?, 
        discount_rate = ?, discount_amount = ?, subtotal = ?, 
        vat_rate = ?, vat_amount = ?, irpf_rate = ?, irpf_amount = ?, 
        total = ?, status = ?, notes = ?
      WHERE id = ?
    `).run(
      number, clientId, date, due_date || null,
      discount_rate, totals.discountAmount, totals.subtotal,
      vat_rate, totals.vat, irpf_rate, totals.irpf,
      totals.total, status, notes || null, id
    );

    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total)
      VALUES (?, ?, ?, ?, ?)
    `);

    cleanItems.forEach((item) => {
      insertItem.run(id, item.description, item.quantity, item.unit_price, item.total);
    });

    return id;
  });

  updateInvoice();
  res.json({ success: true, id });
}));

app.post('/api/invoices', tryHandler((req, res) => {
  const number = String(req.body.number || '').trim();
  const client_name = String(req.body.client_name || '').trim();
  const date = String(req.body.date || '').trim();
  const due_date = String(req.body.due_date || '').trim();
  const discount_rate = asNumber(req.body.discount_rate, 0);
  const vat_rate = asNumber(req.body.vat_rate, 21);
  const irpf_rate = asNumber(req.body.irpf_rate, 15);
  const status = String(req.body.status || 'PENDING').toUpperCase();
  const notes = String(req.body.notes || '').trim();

  if (!number || !client_name || !date) {
    return res.status(400).json({ error: 'Numero, cliente y fecha son obligatorios.' });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Estado no valido.' });
  }
  if (vat_rate < 0 || irpf_rate < 0 || discount_rate < 0) {
    return res.status(400).json({ error: 'IVA, IRPF y Descuento no pueden ser negativos.' });
  }

  const cleanItems = sanitizeItems(req.body.items);
  const totals = calculateInvoiceTotals(cleanItems, vat_rate, irpf_rate, discount_rate);

  const insertInvoice = db.prepare(`
    INSERT INTO invoices (
      number, client_id, date, due_date, discount_rate, discount_amount, subtotal, vat_rate, vat_amount, irpf_rate, irpf_amount, total, status, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total)
    VALUES (?, ?, ?, ?, ?)
  `);

  const saveInvoice = db.transaction(() => {
    let client = db.prepare('SELECT id FROM clients WHERE name = ?').get(client_name);
    let clientId = client?.id;
    if (!clientId) {
      const clientResult = db.prepare('INSERT INTO clients (name) VALUES (?)').run(client_name);
      clientId = clientResult.lastInsertRowid;
    }

    const invoiceResult = insertInvoice.run(
      number,
      clientId,
      date,
      due_date || null,
      discount_rate,
      totals.discountAmount,
      totals.subtotal,
      vat_rate,
      totals.vat,
      irpf_rate,
      totals.irpf,
      totals.total,
      status,
      notes || null
    );
    const invoiceId = invoiceResult.lastInsertRowid;

    cleanItems.forEach((item) => {
      insertItem.run(invoiceId, item.description, item.quantity, item.unit_price, item.total);
    });

    return invoiceId;
  });

  const invoiceId = saveInvoice();
  res.status(201).json({ success: true, id: invoiceId });
}));

app.delete('/api/invoices/:id', tryHandler((req, smugglers) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return smugglers.status(400).json({ error: 'ID de factura invalido.' });
  }
  const result = db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
  if (!result.changes) {
    return smugglers.status(404).json({ error: 'Factura no encontrada.' });
  }
  smugglers.json({ success: true });
}));

app.patch('/api/invoices/:id/status', tryHandler((req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const status = String(req.body.status || '').toUpperCase();
  
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de factura invalido.' });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Estado no valido.' });
  }

  const result = db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, id);
  if (!result.changes) {
    return res.status(404).json({ error: 'Factura no encontrada.' });
  }
  res.json({ success: true, status });
}));

app.get('/api/invoices/:id/pdf', tryHandler(async (req, res) => {
  const invoice = db.prepare(`
    SELECT i.*, c.name as client_name, c.tax_id as client_tax_id, c.address as client_address
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    WHERE i.id = ?
  `).get(req.params.id);

  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada.' });

  invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
  if (!invoice.items || invoice.items.length === 0) {
    return res.status(400).json({ error: 'La factura no tiene conceptos para generar PDF.' });
  }

  const safeNumber = String(invoice.number || invoice.id).replace(/[^\w.-]/g, '_');
  const exportStamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Factura-${safeNumber}-${exportStamp}.pdf"`);

  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    await generateInvoicePdf(invoice, settings, res);
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ error: 'No se pudo generar el PDF.' });
    }
    throw error;
  }
}));

// --- STATS API ---
app.get('/api/stats', tryHandler((req, res) => {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(total), 0) AS totalBilled,
      COALESCE(SUM(CASE WHEN status != 'PAID' THEN total ELSE 0 END), 0) AS totalPending,
      COUNT(*) AS invoiceCount
    FROM invoices
  `).get();
  const clientCount = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
  const totalExpenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM cash_flow WHERE type = \'EXPENSE\'').get().total;
  
  res.json({
    totalBilled: round2(totals.totalBilled),
    totalPending: round2(totals.totalPending),
    clientCount,
    invoiceCount: totals.invoiceCount,
    totalExpenses: round2(totalExpenses)
  });
}));

app.get('/api/stats/chart', tryHandler((req, res) => {
  // Group invoices by month (YYYY-MM) and sum total where status is not CANCELLED
  const rawData = db.prepare(`
    SELECT 
      strftime('%Y-%m', date) as month,
      SUM(total) as revenue
    FROM invoices
    WHERE status != 'CANCELLED'
    GROUP BY month
    ORDER BY month ASC
    LIMIT 12
  `).all();

  // Create an array of the last 6 months
  const months = [];
  const revenues = [];
  
  // Quick manual logic for last 6 months to ensure zero-filled months
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const mStr = d.toISOString().slice(0, 7); // YYYY-MM
    months.push(mStr);
    
    const found = rawData.find(r => r.month === mStr);
    revenues.push(found ? round2(found.revenue) : 0);
  }

  res.json({ labels: months, data: revenues });
}));

// --- CASH FLOW API ---
app.get('/api/cash-flow', tryHandler((req, res) => {
  const rows = db.prepare('SELECT * FROM cash_flow ORDER BY date DESC, id DESC').all();
  res.json(rows);
}));

app.post('/api/cash-flow', tryHandler((req, res) => {
  const { type, description, amount, date } = req.body;
  if (!type || !description || !amount) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para el movimiento de caja.' });
  }
  const info = db.prepare('INSERT INTO cash_flow (type, description, amount, date) VALUES (?, ?, ?, ?)').run(
    type, description, amount, date || new Date().toISOString().split('T')[0]
  );
  res.json({ id: info.lastInsertRowid });
}));

app.delete('/api/cash-flow/:id', tryHandler((req, res) => {
  db.prepare('DELETE FROM cash_flow WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

// --- SETTINGS API ---
app.get('/api/settings', tryHandler((req, res) => {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  res.json(settings);
}));

app.patch('/api/settings', tryHandler((req, res) => {
  const { 
    company_name, tax_id, address, default_vat_rate, default_irpf_rate,
    phone, email, website, bank_name, iban, invoice_prefix, invoice_footer,
    legal_info, vat_expenses
  } = req.body;
  
  db.prepare(`
    UPDATE settings SET 
      company_name = ?,
      tax_id = ?,
      address = ?,
      default_vat_rate = ?,
      default_irpf_rate = ?,
      phone = ?,
      email = ?,
      website = ?,
      bank_name = ?,
      iban = ?,
      invoice_prefix = ?,
      invoice_footer = ?,
      legal_info = ?,
      vat_expenses = ?
    WHERE id = 1
  `).run(
    company_name, 
    tax_id, 
    address, 
    asNumber(default_vat_rate, 21.0), 
    asNumber(default_irpf_rate, 15.0),
    phone || '',
    email || '',
    website || '',
    bank_name || '',
    iban || '',
    invoice_prefix || 'FAC-',
    invoice_footer || 'Gracias por confiar en nuestros servicios.',
    legal_info || '',
    asNumber(vat_expenses, 0)
  );

  res.json({ success: true });
}));

app.get('/api/export/csv', tryHandler((req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, c.name as client_name 
    FROM invoices i 
    JOIN clients c ON i.client_id = c.id 
    ORDER BY i.date DESC
  `).all();

  let csv = '\uFEFF'; // BOM for Excel
  csv += 'Fecha,Numero,Cliente,Subtotal,IVA,IRPF,Total,Estado\n';
  invoices.forEach(inv => {
    csv += `${inv.date},${inv.number},"${inv.client_name.replace(/"/g, '""')}",${inv.subtotal},${inv.vat_amount},${inv.irpf_amount},${inv.total},${inv.status}\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="Facturas_Export.csv"');
  res.send(csv);
}));


app.use((err, req, res, next) => {
  console.error(err);

  if (err && typeof err.message === 'string' && err.message.includes('UNIQUE constraint failed: invoices.number')) {
    return res.status(409).json({ error: 'El numero de factura ya existe.' });
  }
  if (err && typeof err.message === 'string' && err.message.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({ error: 'Operacion invalida por relacion de datos.' });
  }
  if (err && typeof err.message === 'string' && err.message.includes('La factura debe')) {
    return res.status(400).json({ error: err.message });
  }
  if (err && typeof err.message === 'string' && err.message.includes('concepto')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Error interno del servidor.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Max Limpio Server running at http://localhost:${PORT}`);
    const url = `http://localhost:${PORT}`;
    const { exec } = require('child_process');
    // Abre el navegador predeterminado del sistema de forma segura
    exec(`start "" "${url}"`);
  });
}

module.exports = app;
