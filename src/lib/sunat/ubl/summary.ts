/**
 * MÓDULO 18.6 - Generador de XML para Resumen Diario de Boletas (RC)
 * 
 * El Resumen Diario permite informar a SUNAT las boletas de venta y notas asociadas
 * emitidas en un día específico. Es un envío diferido que devuelve un ticket de proceso.
 * 
 * Formato: RC + RUC + FECHA_REFERENCIA + CORRELATIVO
 * Ejemplo: RC-20123456789-20240115-001
 * 
 * @see https://cpe.sunat.gob.pe/node/88
 */
import { create } from 'xmlbuilder2';
import { format } from 'date-fns';
import { SUMMARY_NAMESPACES, SUMMARY_DOC_TYPES, SUMMARY_STATUS, UBL_NAMESPACES } from './types';
import { formatUBLDate, formatUBLAmount, mapCustomerDocTypeToSunat } from './common';

export interface SummaryDocumentLine {
  /** ID único del documento en la BD */
  documentId: string;
  /** Serie del documento */
  series: string;
  /** Número correlativo */
  number: number;
  /** Tipo de documento (BOLETA, NOTA_CREDITO, NOTA_DEBITO) */
  docType: 'BOLETA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  /** Tipo de documento del cliente */
  customerDocType: string;
  /** Número de documento del cliente */
  customerDocNumber: string;
  /** Gravado (base imponible) */
  taxable: number;
  /** IGV */
  igv: number;
  /** Total */
  total: number;
  /** Moneda (default PEN) */
  currency?: string;
  /** Estado del item: 1=Adicionar, 2=Modificar, 3=Anular */
  status?: '1' | '2' | '3';
  /** Para notas: referencia al documento original */
  referenceDocType?: string;
  referenceDocNumber?: string;
}

export interface SummaryPayload {
  /** Datos del emisor */
  issuer: {
    ruc: string;
    razonSocial: string;
  };
  /** Fecha de referencia (día de emisión de las boletas) */
  referenceDate: Date;
  /** Fecha de generación del resumen */
  issueDate: Date;
  /** Serie del resumen (ej: RC01) */
  series: string;
  /** Número correlativo del resumen */
  number: number;
  /** Líneas de documentos */
  lines: SummaryDocumentLine[];
}

/**
 * Genera el nombre del archivo de resumen diario
 * Formato: RUC-RC-YYYYMMDD-NNNN.xml
 */
export function getSummaryFilename(ruc: string, series: string, number: number, referenceDate: Date): string {
  const dateStr = format(referenceDate, 'yyyyMMdd');
  const paddedNumber = number.toString().padStart(5, '0');
  // Formato: 20123456789-RC-20240115-00001
  return `${ruc}-${series}-${dateStr}-${paddedNumber}`;
}

/**
 * Genera el ID del resumen diario
 * Formato: RC-YYYYMMDD-NNNNN
 */
export function getSummaryId(series: string, referenceDate: Date, number: number): string {
  const dateStr = format(referenceDate, 'yyyyMMdd');
  const paddedNumber = number.toString().padStart(5, '0');
  return `${series}-${dateStr}-${paddedNumber}`;
}

/**
 * Genera el XML del Resumen Diario (SummaryDocuments)
 * 
 * @param payload - Datos del resumen
 * @param docId - ID para la firma (generalmente igual al ID del documento)
 * @returns XML string sin firmar
 */
export function generateSummaryXML(payload: SummaryPayload, docId: string): string {
  const { issuer, referenceDate, issueDate, series, number, lines } = payload;

  // Validaciones básicas
  if (lines.length === 0) {
    throw new Error('El resumen debe contener al menos un documento');
  }
  if (lines.length > 500) {
    throw new Error('El resumen no puede contener más de 500 documentos por envío');
  }

  const summaryId = getSummaryId(series, referenceDate, number);

  // Crear documento raíz con namespaces específicos de SUNAT
  const doc = create({ version: '1.0', encoding: 'UTF-8', standalone: false })
    .ele('SummaryDocuments', {
      'xmlns': SUMMARY_NAMESPACES.xmlns,
      'xmlns:cac': UBL_NAMESPACES.INVOICE['xmlns:cac'],
      'xmlns:cbc': UBL_NAMESPACES.INVOICE['xmlns:cbc'],
      'xmlns:ds': SUMMARY_NAMESPACES['xmlns:ds'],
      'xmlns:ext': UBL_NAMESPACES.INVOICE['xmlns:ext'],
      'xmlns:sac': SUMMARY_NAMESPACES['xmlns:sac'],
    });

  // UBL Extensions (placeholder para firma)
  const ublExtensions = doc.ele('ext:UBLExtensions');
  const ublExtension = ublExtensions.ele('ext:UBLExtension');
  ublExtension.ele('ext:ExtensionContent')
    .com('Signature placeholder - will be added by signing process');

  // Versión UBL
  doc.ele('cbc:UBLVersionID').txt('2.0');
  doc.ele('cbc:CustomizationID').txt('1.1');

  // ID del resumen (RC-YYYYMMDD-NNNNN)
  doc.ele('cbc:ID').txt(summaryId);

  // Fecha de referencia (día de las boletas)
  doc.ele('cbc:ReferenceDate').txt(formatUBLDate(referenceDate));

  // Fecha de emisión del resumen
  doc.ele('cbc:IssueDate').txt(formatUBLDate(issueDate));

  // Firma
  const signature = doc.ele('cac:Signature');
  signature.ele('cbc:ID').txt(docId);
  const signParty = signature.ele('cac:SignatoryParty');
  signParty.ele('cac:PartyIdentification').ele('cbc:ID').txt(issuer.ruc);
  signParty.ele('cac:PartyName').ele('cbc:Name').txt(issuer.razonSocial);
  signature.ele('cac:DigitalSignatureAttachment')
    .ele('cac:ExternalReference')
    .ele('cbc:URI').txt('#' + docId);

  // AccountingSupplierParty (Emisor)
  const supplierParty = doc.ele('cac:AccountingSupplierParty');
  supplierParty.ele('cbc:CustomerAssignedAccountID').txt(issuer.ruc);
  supplierParty.ele('cbc:AdditionalAccountID').txt('6'); // RUC
  const party = supplierParty.ele('cac:Party');
  party.ele('cac:PartyLegalEntity')
    .ele('cbc:RegistrationName').txt(issuer.razonSocial);

  // SummaryDocumentsLine (cada documento)
  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const summaryLine = doc.ele('sac:SummaryDocumentsLine');
    
    // Número de línea
    summaryLine.ele('cbc:LineID').txt(lineNumber.toString());

    // Tipo de documento (03=Boleta, 07=NC, 08=ND)
    const docTypeCode = getDocTypeCode(line.docType);
    summaryLine.ele('cbc:DocumentTypeCode').txt(docTypeCode);

    // ID del documento (Serie-Número)
    const docNumber = line.number.toString().padStart(8, '0');
    summaryLine.ele('cbc:ID').txt(`${line.series}-${docNumber}`);

    // Cliente
    const customerParty = summaryLine.ele('cac:AccountingCustomerParty');
    customerParty.ele('cbc:CustomerAssignedAccountID').txt(line.customerDocNumber || '-');
    customerParty.ele('cbc:AdditionalAccountID').txt(mapCustomerDocTypeToSunat(line.customerDocType));

    // Referencia a documento original (para notas de crédito/débito asociadas a boletas)
    if (line.referenceDocType && line.referenceDocNumber) {
      const billingRef = summaryLine.ele('cac:BillingReference').ele('cac:InvoiceDocumentReference');
      billingRef.ele('cbc:ID').txt(line.referenceDocNumber);
      billingRef.ele('cbc:DocumentTypeCode').txt(line.referenceDocType);
    }

    // Estado del item (1=Adicionar, 2=Modificar, 3=Anular)
    const status = summaryLine.ele('cac:Status');
    status.ele('cbc:ConditionCode').txt(line.status || SUMMARY_STATUS.ADICIONAR);

    // Monto total
    const currency = line.currency || 'PEN';
    summaryLine.ele('sac:TotalAmount', { currencyID: currency })
      .txt(formatUBLAmount(line.total));

    // BillingPayment (pagos/totales)
    // Total gravado
    if (line.taxable > 0) {
      const gravadoPayment = summaryLine.ele('sac:BillingPayment');
      gravadoPayment.ele('cbc:PaidAmount', { currencyID: currency })
        .txt(formatUBLAmount(line.taxable));
      gravadoPayment.ele('cbc:InstructionID').txt('01'); // Gravado
    }

    // Total exonerado (si aplica) - por ahora asumimos todo gravado
    // Total inafecto (si aplica)

    // AllowanceCharge (descuentos/cargos globales) - opcional
    const allowance = summaryLine.ele('cac:AllowanceCharge');
    allowance.ele('cbc:ChargeIndicator').txt('false');
    allowance.ele('cbc:Amount', { currencyID: currency }).txt('0.00');

    // TaxTotal (IGV)
    const taxTotal = summaryLine.ele('cac:TaxTotal');
    taxTotal.ele('cbc:TaxAmount', { currencyID: currency })
      .txt(formatUBLAmount(line.igv));
    
    const taxSubtotal = taxTotal.ele('cac:TaxSubtotal');
    taxSubtotal.ele('cbc:TaxAmount', { currencyID: currency })
      .txt(formatUBLAmount(line.igv));
    
    const taxCategory = taxSubtotal.ele('cac:TaxCategory');
    const taxScheme = taxCategory.ele('cac:TaxScheme');
    taxScheme.ele('cbc:ID').txt('1000'); // IGV
    taxScheme.ele('cbc:Name').txt('IGV');
    taxScheme.ele('cbc:TaxTypeCode').txt('VAT');
  });

  return doc.end({ prettyPrint: true });
}

/**
 * Mapea el tipo de documento al código SUNAT
 */
function getDocTypeCode(docType: string): string {
  switch (docType) {
    case 'BOLETA':
      return SUMMARY_DOC_TYPES.BOLETA;
    case 'NOTA_CREDITO':
      return SUMMARY_DOC_TYPES.NOTA_CREDITO_BOLETA;
    case 'NOTA_DEBITO':
      return SUMMARY_DOC_TYPES.NOTA_DEBITO_BOLETA;
    default:
      return SUMMARY_DOC_TYPES.BOLETA;
  }
}

/**
 * Valida el payload del resumen
 */
export function validateSummaryPayload(payload: SummaryPayload): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.issuer?.ruc || payload.issuer.ruc.length !== 11) {
    errors.push('RUC del emisor inválido');
  }

  if (!payload.issuer?.razonSocial) {
    errors.push('Razón social del emisor requerida');
  }

  if (!payload.referenceDate) {
    errors.push('Fecha de referencia requerida');
  }

  if (!payload.lines || payload.lines.length === 0) {
    errors.push('Debe incluir al menos un documento');
  }

  if (payload.lines && payload.lines.length > 500) {
    errors.push('Máximo 500 documentos por resumen');
  }

  // Validar cada línea
  payload.lines?.forEach((line, idx) => {
    if (!line.series) {
      errors.push(`Línea ${idx + 1}: Serie requerida`);
    }
    if (!line.number || line.number <= 0) {
      errors.push(`Línea ${idx + 1}: Número de documento inválido`);
    }
    if (line.total < 0) {
      errors.push(`Línea ${idx + 1}: Total no puede ser negativo`);
    }
  });

  return { valid: errors.length === 0, errors };
}
