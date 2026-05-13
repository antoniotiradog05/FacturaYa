const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');

async function generateInvoicePdf(invoice, settings, stream) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    doc.on('end', resolve);
    doc.on('error', reject);
    doc.pipe(stream);

    const formatMoney = (value) => `${Number(value || 0).toFixed(2)} EUR`;
    const bodyColor = '#1f2937';
    const mutedColor = '#6b7280';
    const accentDark = '#111827';
    const brandAcid = '#00d2ff'; // Azul Agua Cristalina
    const brandRed = '#ff6b6b';  // Rojo Coral suave
    const lineItemHeight = 28;

    // 1. TOP BRANDING BAR (Neo-brutalist sharp lines)
    doc.rect(0, 0, 612, 16).fill(brandAcid);
    doc.rect(0, 16, 612, 4).fill(accentDark);

    // 2. HEADER: Company & Invoice Info
    if (settings?.logo_url && settings.logo_url.startsWith('data:image/')) {
        try {
            const base64Data = settings.logo_url.split(',')[1];
            const logoBuffer = Buffer.from(base64Data, 'base64');
            doc.image(logoBuffer, 50, 45, { height: 45 });
        } catch (e) {
            console.error('Error rendering logo:', e);
            doc.fillColor(brandRed).font('Helvetica-Bold').fontSize(32).text('ML', 50, 50);
        }
    } else {
        doc.fillColor(brandRed).font('Helvetica-Bold').fontSize(32).text('ML', 50, 50);
    }

    doc
      .fillColor(accentDark)
      .font('Helvetica-Bold')
      .fontSize(24)
      .text('FACTURA', 360, 48, { width: 200, align: 'right', characterSpacing: 2 });

    // Invoice Meta Badge
    doc.roundedRect(420, 78, 140, 44, 4).fill('#f9fafb');
    doc.strokeColor('#e5e7eb').lineWidth(1).roundedRect(420, 78, 140, 44, 4).stroke();

    doc
      .fillColor(bodyColor)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(`Nº ${invoice.number}`, 430, 86)
      .font('Helvetica')
      .fillColor(mutedColor)
      .text(`${dayjs(invoice.date).format('DD MMM YYYY')}`, 430, 102);

    // 3. ISSUER & CLIENT INFO (Clean layout with sharp borders)
    const cardsTop = 150;

    // Emisor
    doc.rect(50, cardsTop, 240, 2).fill(accentDark);
    doc
      .fillColor(accentDark)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('EMISOR', 50, cardsTop + 12)
      .fillColor(bodyColor)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(settings?.company_name || 'Mi Empresa', 50, cardsTop + 28)
      .font('Helvetica')
      .fontSize(10)
      .fillColor(mutedColor);

    let issuerY = cardsTop + 44;
    if (settings?.tax_id && settings.tax_id !== 'NIF/CIF') {
      doc.text(`NIF: ${settings.tax_id}`, 50, issuerY);
      issuerY += 14;
    }
    if (settings?.address && settings.address !== 'Dirección') {
      doc.text(settings.address, 50, issuerY, { width: 240 });
      issuerY += 14;
    }

    let contactY = issuerY + 4;
    if (settings?.phone) { doc.text(`Tel: ${settings.phone}`, 50, contactY); contactY += 14; }
    if (settings?.email) { doc.text(`Email: ${settings.email}`, 50, contactY); contactY += 14; }
    if (settings?.website) { doc.fillColor(accentDark).text(settings.website, 50, contactY); }

    // Cliente
    doc.rect(320, cardsTop, 240, 2).fill(accentDark);
    doc
      .fillColor(accentDark)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('FACTURAR A', 320, cardsTop + 12)
      .fillColor(bodyColor)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(invoice.client_name || '-', 320, cardsTop + 28, { width: 240 })
      .font('Helvetica')
      .fontSize(10)
      .fillColor(mutedColor);

    let clientY = cardsTop + 44;
    if (invoice.client_tax_id && invoice.client_tax_id !== '-') {
      doc.text(`NIF/CIF: ${invoice.client_tax_id}`, 320, clientY);
      clientY += 14;
    }
    if (invoice.client_address && invoice.client_address !== '-') {
      doc.text(invoice.client_address, 320, clientY, { width: 240 });
    }

    // 4. ITEMS TABLE (Neo-Brutalist Black Header with Acid Text)
    const tableTop = 290;
    doc.rect(50, tableTop, 510, 28).fill(accentDark);

    doc
      .fillColor(brandAcid)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('CONCEPTO', 62, tableTop + 10)
      .text('CANT.', 352, tableTop + 10, { width: 40, align: 'center' })
      .text('PRECIO', 410, tableTop + 10, { width: 70, align: 'right' })
      .text('IMPORTE', 490, tableTop + 10, { width: 60, align: 'right' });

    let currentY = tableTop + 36;
    invoice.items.forEach((item, index) => {
      const lineTotal = Number(item.quantity) * Number(item.unit_price);

      // Striped background for readability
      if (index % 2 === 0) {
        doc.rect(50, currentY - 4, 510, lineItemHeight).fill('#f9fafb');
      }

      doc
        .fillColor(bodyColor)
        .font('Helvetica')
        .fontSize(10)
        .text(item.description || '-', 62, currentY, { width: 280 })
        .text(String(item.quantity || 0), 352, currentY, { width: 40, align: 'center' })
        .text(formatMoney(item.unit_price), 410, currentY, { width: 70, align: 'right' })
        .font('Helvetica-Bold')
        .text(formatMoney(lineTotal), 490, currentY, { width: 60, align: 'right' });

      // Subtle bottom border for each item
      doc.strokeColor('#f3f4f6').lineWidth(1).moveTo(50, currentY + 20).lineTo(560, currentY + 20).stroke();
      currentY += lineItemHeight;
    });

    // Calculations
    const grossSubtotal = invoice.items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);
    const discountAmount = Number(invoice.discount_amount || 0);
    const subtotal = Number(invoice.subtotal ?? (grossSubtotal - discountAmount));
    const vatAmount = Number(invoice.vat_amount ?? subtotal * ((invoice.vat_rate || 21) / 100));
    const irpfAmount = Number(invoice.irpf_amount ?? subtotal * ((invoice.irpf_rate || 15) / 100));
    const total = Number(invoice.total ?? (subtotal + vatAmount - irpfAmount));

    // 5. PANELS: Bank Details, Notes & Summary
    const panelsTop = Math.max(currentY + 30, 450);

    // Left side: Bank & Notes
    if (settings?.bank_name || settings?.iban) {
      doc.rect(50, panelsTop, 250, 2).fill(accentDark);
      doc
        .fillColor(accentDark)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('DATOS DE PAGO', 50, panelsTop + 12)
        .font('Helvetica')
        .fontSize(10)
        .fillColor(bodyColor);

      if (settings.bank_name) doc.text(settings.bank_name, 50, panelsTop + 28);
      if (settings.iban) {
        doc.font('Helvetica-Bold').fillColor(accentDark).text(`IBAN: ${settings.iban}`, 50, panelsTop + 42);
      }
    }

    if (invoice.notes) {
      const notesTop = (settings?.bank_name || settings?.iban) ? panelsTop + 75 : panelsTop;
      doc.rect(50, notesTop, 250, 2).fill('#e5e7eb');
      doc
        .fillColor(mutedColor)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('OBSERVACIONES', 50, notesTop + 10)
        .font('Helvetica')
        .fontSize(9)
        .text(invoice.notes, 50, notesTop + 22, { width: 240, lineBreak: true });
    }

    // Right side: Summary Box
    doc.rect(330, panelsTop, 230, 2).fill(accentDark);

    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(10)
      .text('Suma Conceptos', 330, panelsTop + 16)
      .text(formatMoney(grossSubtotal), 480, panelsTop + 16, { width: 80, align: 'right' });

    let offset = 36;
    if (discountAmount > 0) {
      doc
        .fillColor('#10b981')
        .font('Helvetica-Bold')
        .text(`Descuento (${invoice.discount_rate || 0}%)`, 330, panelsTop + offset)
        .text(`-${formatMoney(discountAmount)}`, 480, panelsTop + offset, { width: 80, align: 'right' });
      offset += 20;
    }

    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .text(`IVA (${invoice.vat_rate || 21}%)`, 330, panelsTop + offset)
      .text(formatMoney(vatAmount), 480, panelsTop + offset, { width: 80, align: 'right' });
    offset += 20;

    doc
      .text(`IRPF (${invoice.irpf_rate || 15}%)`, 330, panelsTop + offset)
      .text(`-${formatMoney(irpfAmount)}`, 480, panelsTop + offset, { width: 80, align: 'right' });

    // Total Badge (Neo-brutalist)
    const totalTop = panelsTop + offset + 20;
    doc.rect(330, totalTop, 230, 40).fill(accentDark);
    doc
      .fillColor(brandAcid)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('TOTAL', 345, totalTop + 14)
      .text(formatMoney(total), 450, totalTop + 14, { width: 95, align: 'right' });

    // 6. FOOTER
    if (settings?.invoice_footer) {
      doc
        .fillColor('#9ca3af')
        .font('Helvetica')
        .fontSize(8.5)
        .text(settings.invoice_footer, 50, 780, { width: 510, align: 'center' });
    }

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
