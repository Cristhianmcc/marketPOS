import type { CustomerDocType, SunatDocType, SunatEnv, SunatStatus } from '@prisma/client';
import { buildSunatQrText } from '@/lib/sunat/qr';

/**
 * Datos fiscales que acompañan al ticket impreso de una venta con boleta o
 * factura electrónica. El ticket térmico y el recibo del navegador usan el
 * mismo objeto para mostrar la misma representación impresa.
 */
export interface FiscalTicketData {
  docType: 'FACTURA' | 'BOLETA';
  title: string;
  fullNumber: string;
  issueDate: string;
  issuer: {
    ruc: string;
    businessName: string;
    tradeName: string | null;
    address: string | null;
  };
  customer: {
    documentLabel: string;
    documentNumber: string | null;
    name: string;
    address: string | null;
  };
  taxable: number;
  igv: number;
  total: number;
  amountInWords: string;
  qrText: string;
  hash: string | null;
  legend: string;
  isBeta: boolean;
  status: SunatStatus;
}

export interface FiscalTicketSource {
  document: {
    docType: SunatDocType;
    series: string;
    number: number;
    fullNumber: string;
    issueDate: Date;
    customerDocType: CustomerDocType;
    customerDocNumber: string;
    customerName: string;
    customerAddress: string | null;
    taxable: unknown;
    igv: unknown;
    total: unknown;
    status: SunatStatus;
    hash: string | null;
    qrText: string | null;
  };
  settings: {
    env: SunatEnv;
    ruc: string | null;
    razonSocial: string | null;
    address: string | null;
  };
  store: {
    name: string;
    ruc: string | null;
    address: string | null;
  };
}

/** Estados en los que el comprobante no debe presentarse como válido. */
const NON_PRINTABLE_STATUSES: SunatStatus[] = ['REJECTED', 'ERROR', 'CANCELED'];

const DOCUMENT_LABELS: Record<CustomerDocType, string> = {
  DNI: 'DNI',
  RUC: 'RUC',
  CE: 'C.E.',
  PASSPORT: 'PASAPORTE',
  OTHER: 'DOC.',
};

const UNITS = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const TEENS = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const TWENTIES = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** 0..999 en palabras; `apocope` convierte UNO en UN (UN MIL, VEINTIUN MILLONES). */
function hundredsToWords(n: number, apocope: boolean): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundred) parts.push(HUNDREDS[hundred]);
  if (rest) {
    let words: string;
    if (rest < 10) words = UNITS[rest];
    else if (rest < 20) words = TEENS[rest - 10];
    else if (rest < 30) words = TWENTIES[rest - 20];
    else {
      const unit = rest % 10;
      words = TENS[Math.floor(rest / 10)] + (unit ? ` Y ${UNITS[unit]}` : '');
    }
    if (apocope && words.endsWith('UNO')) words = words === 'VEINTIUNO' ? 'VEINTIUN' : `${words.slice(0, -3)}UN`;
    parts.push(words);
  }
  return parts.join(' ');
}

function integerToWords(n: number): string {
  if (n === 0) return 'CERO';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'UN MILLON' : `${hundredsToWords(millions, true)} MILLONES`);
  if (thousands) parts.push(thousands === 1 ? 'MIL' : `${hundredsToWords(thousands, true)} MIL`);
  if (rest) parts.push(hundredsToWords(rest, false));
  return parts.join(' ');
}

/** Importe en letras como en las boletas peruanas: "SON: SIETE CON 50/100 SOLES". */
export function amountToWordsPEN(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const integer = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `SON: ${integerToWords(integer)} CON ${fraction}/100 SOLES`;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatIssueDate(date: Date): string {
  return date.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Arma la representación impresa de una boleta o factura. Devuelve null para
 * notas, resúmenes o comprobantes rechazados/anulados, que no deben imprimirse
 * como comprobante válido en el ticket de la venta.
 */
export function buildFiscalTicket(source: FiscalTicketSource): FiscalTicketData | null {
  const { document, settings, store } = source;
  if (document.docType !== 'FACTURA' && document.docType !== 'BOLETA') return null;
  if (NON_PRINTABLE_STATUSES.includes(document.status)) return null;

  const isFactura = document.docType === 'FACTURA';
  const title = isFactura ? 'FACTURA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA';
  const issuerRuc = settings.ruc || store.ruc || '';
  const businessName = settings.razonSocial || store.name;
  const igv = toNumber(document.igv);
  const total = toNumber(document.total);
  const anonymous = document.customerDocType === 'OTHER' && (!document.customerDocNumber || document.customerDocNumber === '-');

  return {
    docType: document.docType,
    title,
    fullNumber: document.fullNumber,
    issueDate: formatIssueDate(document.issueDate),
    issuer: {
      ruc: issuerRuc,
      businessName,
      tradeName: store.name && store.name !== businessName ? store.name : null,
      address: settings.address || store.address,
    },
    customer: {
      documentLabel: DOCUMENT_LABELS[document.customerDocType],
      documentNumber: anonymous ? null : document.customerDocNumber,
      name: document.customerName || 'CLIENTES VARIOS',
      address: isFactura ? document.customerAddress : null,
    },
    taxable: toNumber(document.taxable),
    igv,
    total,
    amountInWords: amountToWordsPEN(total),
    qrText: document.qrText || buildSunatQrText({
      issuerRuc,
      docType: document.docType,
      series: document.series,
      number: document.number,
      igv,
      total,
      issueDate: document.issueDate,
      customerDocType: document.customerDocType,
      customerDocNumber: document.customerDocNumber,
      hash: document.hash,
    }),
    hash: document.hash,
    legend: `Representacion impresa de la ${isFactura ? 'Factura Electronica' : 'Boleta de Venta Electronica'}.`,
    isBeta: settings.env === 'BETA',
    status: document.status,
  };
}
