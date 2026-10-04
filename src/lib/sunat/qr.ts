import type { CustomerDocType, SunatDocType } from '@prisma/client';

const DOCUMENT_CODES: Partial<Record<SunatDocType, string>> = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
};

const CUSTOMER_DOCUMENT_CODES: Record<CustomerDocType, string> = {
  DNI: '1',
  RUC: '6',
  CE: '4',
  PASSPORT: '7',
  OTHER: '0',
};

export interface SunatQrData {
  issuerRuc: string;
  docType: SunatDocType;
  series: string;
  number: number;
  igv: number;
  total: number;
  issueDate: Date;
  customerDocType: CustomerDocType;
  customerDocNumber: string;
  hash?: string | null;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Texto del QR de la representación impresa CPE.
 * Se conservan los separadores finales para que lectores externos puedan
 * distinguir los campos opcionales según la estructura publicada por SUNAT.
 */
export function buildSunatQrText(data: SunatQrData): string {
  const documentCode = DOCUMENT_CODES[data.docType];
  if (!documentCode) {
    throw new Error(`No se puede generar QR para ${data.docType}`);
  }

  return [
    data.issuerRuc.trim(),
    documentCode,
    data.series.trim(),
    String(data.number),
    data.igv.toFixed(2),
    data.total.toFixed(2),
    formatDate(data.issueDate),
    CUSTOMER_DOCUMENT_CODES[data.customerDocType],
    data.customerDocNumber.trim(),
    data.hash?.trim() || '',
    '',
  ].join('|');
}
