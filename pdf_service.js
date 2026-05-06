const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');

async function generateInvoicePdf(invoice, stream) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    doc.on('end', resolve);
    doc.on('error', reject);
    doc.pipe(stream);

    const formatMoney = (value) => `${Number(value || 0).toFixed(2)} EUR`;
    const bodyColor = '#1f2937';
    const mutedColor = '#6b7280';
    const accentColor = '#111827';
    const lightBorder = '#e5e7eb';
    const panelBg = '#f8fafc';
    const lineItemHeight = 24;

    // Header band
    doc.rect(0, 0, 612, 110).fill('#f3f4f6');
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(28)
      .text('SP', 50, 42);
    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(10)
      .text('Documento de facturacion', 50, 76);

    doc
      .fillColor(accentColor)
      .font('Helvetica-Bold')
      .fontSize(19)
      .text('FACTURA', 420, 40, { width: 140, align: 'right' });
    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(10)
      .text(`N. ${invoice.number}`, 420, 66, { width: 140, align: 'right' })
      .text(`Fecha: ${dayjs(invoice.date).format('DD/MM/YYYY')}`, 420, 82, { width: 140, align: 'right' });

    // Issuer and client cards
    const cardsTop = 130;
    doc.roundedRect(50, cardsTop, 245, 96, 8).fill(panelBg);
    doc.roundedRect(315, cardsTop, 245, 96, 8).fill(panelBg);

    doc
      .fillColor('#374151')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('EMISOR', 64, cardsTop + 12)
      .font('Helvetica')
      .fontSize(10)
      .fillColor(bodyColor)
      .text('SP', 64, cardsTop + 30)
      .fillColor(mutedColor)
      .text('NIF/CIF: B12345678', 64, cardsTop + 45)
      .text('Madrid, España', 64, cardsTop + 60);

    doc
      .fillColor('#374151')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('CLIENTE', 329, cardsTop + 12)
      .font('Helvetica')
      .fontSize(10)
      .fillColor(bodyColor)
      .text(invoice.client_name || '-', 329, cardsTop + 30, { width: 220 })
      .fillColor(mutedColor)
      .text(`CIF: ${invoice.client_tax_id || '-'}`, 329, cardsTop + 45)
      .text(invoice.client_address || '-', 329, cardsTop + 60, { width: 220 });

    // Items table
    const tableTop = 255;
    doc.roundedRect(50, tableTop, 510, 26, 6).fill('#111827');
    doc
      .fillColor('#f9fafb')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('DESCRIPCION', 62, tableTop + 9)
      .text('CANT.', 352, tableTop + 9, { width: 40, align: 'center' })
      .text('P. UNITARIO', 410, tableTop + 9, { width: 75, align: 'right' })
      .text('TOTAL', 495, tableTop + 9, { width: 55, align: 'right' });

    let currentY = tableTop + 34;
    invoice.items.forEach((item, index) => {
      const lineTotal = Number(item.quantity) * Number(item.unit_price);
      if (index % 2 === 0) {
        doc.rect(50, currentY - 3, 510, lineItemHeight).fill('#f9fafb');
      }

      doc
        .fillColor(bodyColor)
        .font('Helvetica')
        .fontSize(10)
        .text(item.description || '-', 62, currentY, { width: 275 })
        .text(String(item.quantity || 0), 352, currentY, { width: 40, align: 'center' })
        .text(formatMoney(item.unit_price), 410, currentY, { width: 75, align: 'right' })
        .text(formatMoney(lineTotal), 495, currentY, { width: 55, align: 'right' });

      doc.strokeColor(lightBorder).moveTo(50, currentY + 19).lineTo(560, currentY + 19).stroke();
      currentY += lineItemHeight;
    });

    const subtotal = Number(invoice.subtotal ?? invoice.items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0));
    const vatAmount = Number(invoice.vat_amount ?? subtotal * (invoice.vat_rate / 100));
    const irpfAmount = Number(invoice.irpf_amount ?? subtotal * (invoice.irpf_rate / 100));
    const total = Number(invoice.total ?? (subtotal + vatAmount - irpfAmount));

    // Summary panel
    const summaryTop = Math.max(currentY + 22, 470);
    doc.roundedRect(330, summaryTop, 230, 124, 8).fill('#f3f4f6');
    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(10)
      .text('Subtotal', 345, summaryTop + 18)
      .text(formatMoney(subtotal), 465, summaryTop + 18, { width: 80, align: 'right' })
      .text(`IVA (${invoice.vat_rate}%)`, 345, summaryTop + 40)
      .text(formatMoney(vatAmount), 465, summaryTop + 40, { width: 80, align: 'right' })
      .text(`IRPF (${invoice.irpf_rate}%)`, 345, summaryTop + 62)
      .text(`-${formatMoney(irpfAmount)}`, 465, summaryTop + 62, { width: 80, align: 'right' });

    doc.strokeColor('#d1d5db').moveTo(345, summaryTop + 84).lineTo(545, summaryTop + 84).stroke();
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('TOTAL', 345, summaryTop + 94)
      .text(formatMoney(total), 455, summaryTop + 94, { width: 90, align: 'right' });

    // Footer
    doc
      .fillColor('#9ca3af')
      .font('Helvetica')
      .fontSize(8.5)
      .text('Gracias por confiar en SP.', 50, 780, { width: 510, align: 'center' });

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
