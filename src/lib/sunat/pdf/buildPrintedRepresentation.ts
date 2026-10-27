import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';

export interface PrintedRepresentationItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface PrintedRepresentationData {
  environment: 'BETA' | 'PROD';
  issuer: {
    ruc: string;
    businessName: string;
    address?: string | null;
  };
  document: {
    type: 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
    fullNumber: string;
    issueDate: Date;
    currency: string;
    status: string;
    sunatMessage?: string | null;
  };
  customer: {
    documentType: string;
    documentNumber: string;
    name: string;
    address?: string | null;
  };
  reference?: {
    fullNumber: string;
    reason?: string | null;
  };
  items: PrintedRepresentationItem[];
  totals: {
    taxable: number;
    igv: number;
    exempt?: number;
    unaffected?: number;
    icbper?: number;
    total: number;
  };
  qrText: string;
  hash?: string | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function safeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function money(value: number): string {
  return `S/ ${value.toFixed(2)}`;
}

function documentTitle(type: PrintedRepresentationData['document']['type']): string {
  switch (type) {
    case 'FACTURA': return 'FACTURA ELECTRONICA';
    case 'BOLETA': return 'BOLETA DE VENTA ELECTRONICA';
    case 'NOTA_CREDITO': return 'NOTA DE CREDITO ELECTRONICA';
    case 'NOTA_DEBITO': return 'NOTA DE DEBITO ELECTRONICA';
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export async function buildPrintedRepresentationPdf(
  data: PrintedRepresentationData
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qrDataUrl = await QRCode.toDataURL(data.qrText, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260,
  });
  const qr = await pdf.embedPng(qrDataUrl);

  let page!: PDFPage;
  let y = PAGE_HEIGHT - MARGIN;

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    if (data.environment === 'BETA') {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 23, width: PAGE_WIDTH, height: 23, color: rgb(0.96, 0.78, 0.22) });
      page.drawText('AMBIENTE DE PRUEBAS - SIN VALOR TRIBUTARIO', {
        x: 145, y: PAGE_HEIGHT - 16, size: 9, font: bold, color: rgb(0.22, 0.18, 0.05),
      });
      y -= 12;
    }
  };

  const line = (fromX = MARGIN, toX = PAGE_WIDTH - MARGIN) => {
    page.drawLine({ start: { x: fromX, y }, end: { x: toX, y }, thickness: 0.7, color: rgb(0.72, 0.74, 0.78) });
    y -= 10;
  };

  const text = (value: string, x: number, size = 9, selectedFont = regular, color = rgb(0.08, 0.1, 0.14)) => {
    page.drawText(safeText(value), { x, y, size, font: selectedFont, color });
  };

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN + 45) addPage();
  };

  addPage();

  text(data.issuer.businessName, MARGIN, 16, bold);
  y -= 19;
  text(`RUC: ${data.issuer.ruc}`, MARGIN, 10, bold);
  y -= 14;
  for (const addressLine of wrapText(data.issuer.address || '', regular, 9, 295)) {
    text(addressLine, MARGIN, 9);
    y -= 12;
  }

  page.drawRectangle({ x: 365, y: PAGE_HEIGHT - 151, width: 188, height: 86, borderWidth: 1.2, borderColor: rgb(0.08, 0.25, 0.55) });
  const title = documentTitle(data.document.type);
  page.drawText(title, { x: 459 - bold.widthOfTextAtSize(title, 11) / 2, y: PAGE_HEIGHT - 91, size: 11, font: bold, color: rgb(0.05, 0.2, 0.48) });
  page.drawText(data.document.fullNumber, { x: 459 - bold.widthOfTextAtSize(data.document.fullNumber, 14) / 2, y: PAGE_HEIGHT - 121, size: 14, font: bold });
  y = PAGE_HEIGHT - 171;
  line();

  text(`Fecha de emision: ${data.document.issueDate.toLocaleDateString('es-PE')}`, MARGIN, 9, bold);
  text(`Moneda: ${data.document.currency}`, 365, 9, bold);
  y -= 17;
  text(`Cliente: ${data.customer.name}`, MARGIN, 9);
  y -= 14;
  text(`${data.customer.documentType}: ${data.customer.documentNumber}`, MARGIN, 9);
  y -= 14;
  if (data.customer.address) {
    for (const customerAddressLine of wrapText(data.customer.address, regular, 9, CONTENT_WIDTH)) {
      text(`Direccion: ${customerAddressLine}`, MARGIN, 9);
      y -= 12;
    }
  }
  if (data.reference) {
    y -= 2;
    text(`Comprobante afectado: ${data.reference.fullNumber}`, MARGIN, 9, bold);
    y -= 14;
    if (data.reference.reason) {
      for (const reasonLine of wrapText(`Motivo: ${data.reference.reason}`, regular, 9, CONTENT_WIDTH)) {
        text(reasonLine, MARGIN, 9);
        y -= 12;
      }
    }
  }
  y -= 2;
  line();

  text('Cant.', MARGIN, 8, bold);
  text('Unidad', MARGIN + 43, 8, bold);
  text('Descripcion', MARGIN + 94, 8, bold);
  text('P. Unit.', 426, 8, bold);
  text('Importe', 498, 8, bold);
  y -= 12;
  line();

  for (const item of data.items) {
    const descriptionLines = wrapText(item.description, regular, 8, 245);
    const rowHeight = Math.max(17, descriptionLines.length * 10 + 5);
    ensureSpace(rowHeight + 8);
    text(item.quantity.toFixed(3).replace(/\.000$/, ''), MARGIN, 8);
    text(item.unit, MARGIN + 43, 8);
    descriptionLines.forEach((descriptionLine, index) => {
      page.drawText(descriptionLine, { x: MARGIN + 94, y: y - index * 10, size: 8, font: regular });
    });
    text(item.unitPrice.toFixed(2), 431, 8);
    text(item.total.toFixed(2), 503, 8);
    y -= rowHeight;
  }

  ensureSpace(290);
  line();
  text('Op. gravada:', 388, 9);
  text(money(data.totals.taxable), 493, 9);
  y -= 15;
  // Operaciones sin IGV e ICBPER solo cuando existen
  const extraRows: Array<[string, number | undefined]> = [
    ['Op. exonerada:', data.totals.exempt],
    ['Op. inafecta:', data.totals.unaffected],
  ];
  for (const [label, value] of extraRows) {
    if (!value || value <= 0) continue;
    text(label, 388, 9);
    text(money(value), 493, 9);
    y -= 15;
  }
  text('IGV (18%):', 388, 9);
  text(money(data.totals.igv), 493, 9);
  y -= 15;
  if (data.totals.icbper && data.totals.icbper > 0) {
    text('ICBPER:', 388, 9);
    text(money(data.totals.icbper), 493, 9);
    y -= 15;
  }
  y -= 3;
  text('TOTAL:', 388, 11, bold);
  text(money(data.totals.total), 483, 11, bold);
  y -= 25;
  line();

  const qrSize = 112;
  page.drawImage(qr, { x: MARGIN, y: y - qrSize, width: qrSize, height: qrSize });
  const footerX = MARGIN + qrSize + 18;
  page.drawText('Representacion impresa del comprobante electronico.', { x: footerX, y: y - 20, size: 9, font: regular });
  page.drawText('Consulte la validez del documento en SUNAT.', { x: footerX, y: y - 36, size: 9, font: regular });
  page.drawText(`Estado: ${data.document.status}`, { x: footerX, y: y - 56, size: 9, font: bold });
  if (data.hash) {
    const shortHash = data.hash.length > 52 ? `${data.hash.slice(0, 52)}...` : data.hash;
    page.drawText(`Hash: ${safeText(shortHash)}`, { x: footerX, y: y - 74, size: 7, font: regular });
  }
  if (data.document.sunatMessage) {
    const responseLines = wrapText(`Respuesta SUNAT: ${data.document.sunatMessage}`, regular, 7, 330).slice(0, 3);
    responseLines.forEach((responseLine, index) => {
      page.drawText(responseLine, { x: footerX, y: y - 92 - index * 9, size: 7, font: regular });
    });
  }

  pdf.setTitle(`${title} ${data.document.fullNumber}`);
  pdf.setAuthor(data.issuer.businessName);
  pdf.setSubject('Representacion impresa de comprobante de pago electronico');
  pdf.setCreator('Monterrial POS');
  pdf.setProducer('Monterrial POS');
  pdf.setCreationDate(new Date());
  return pdf.save();
}
