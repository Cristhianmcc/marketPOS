/**
 * MÓDULO 18.6 - Generador de XML para Comunicación de Baja (RA)
 * 
 * La Comunicación de Baja permite anular fiscalmente documentos electrónicos
 * que ya fueron informados a SUNAT. Es un proceso diferido que devuelve un ticket.
 * 
 * - Para FACTURAS: se usa Comunicación de Baja directamente
 * - Para BOLETAS: se usan dos métodos:
 *   1. Comunicación de Baja tradicional
 *   2. Línea con estado "3" (Anular) en el Resumen Diario
 * 
 * Formato: RA + RUC + FECHA_GENERACIÓN + CORRELATIVO  
 * Ejemplo: RA-20123456789-20240115-001
 * 
 * @see https://cpe.sunat.gob.pe/node/88
 */
import { create } from 'xmlbuilder2';
import { format } from 'date-fns';
import { VOIDED_NAMESPACES, UBL_NAMESPACES } from './types';
import { formatUBLDate } from './common';

export interface VoidedDocumentLine {
  /** ID único del documento electrónico en la BD */
  documentId: string;
  /** Tipo de documento (01=Factura, 03=Boleta, 07=NC, 08=ND) */
  documentTypeCode: string;
  /** Serie del documento */
  series: string;
  /** Número correlativo */
  number: number;
  /** Motivo de la baja */
  voidReason: string;
}

export interface VoidedPayload {
  /** Datos del emisor */
  issuer: {
    ruc: string;
    razonSocial: string;
  };
  /** Fecha de generación del documento de baja */
  issueDate: Date;
  /** Fecha de emisión del documento a anular (referencia) */
  referenceDate: Date;
  /** Serie de la comunicación de baja (ej: RA01) */
  series: string;
  /** Número correlativo de la comunicación de baja */
  number: number;
  /** Documentos a dar de baja */
  lines: VoidedDocumentLine[];
}

/**
 * Genera el nombre del archivo de comunicación de baja
 * Formato: RUC-RA-YYYYMMDD-NNNNN.xml
 */
export function getVoidedFilename(ruc: string, series: string, number: number, issueDate: Date): string {
  const dateStr = format(issueDate, 'yyyyMMdd');
  const paddedNumber = number.toString().padStart(5, '0');
  return `${ruc}-${series}-${dateStr}-${paddedNumber}`;
}

/**
 * Genera el ID de la comunicación de baja
 * Formato: RA-YYYYMMDD-NNNNN
 */
export function getVoidedId(series: string, issueDate: Date, number: number): string {
  const dateStr = format(issueDate, 'yyyyMMdd');
  const paddedNumber = number.toString().padStart(5, '0');
  return `${series}-${dateStr}-${paddedNumber}`;
}

/**
 * Mapea el tipo de documento interno al código SUNAT
 */
export function mapDocTypeToCode(docType: string): string {
  const mapping: Record<string, string> = {
    FACTURA: '01',
    BOLETA: '03',
    NOTA_CREDITO: '07',
    NOTA_DEBITO: '08',
  };
  return mapping[docType] || docType;
}

/**
 * Genera el XML de Comunicación de Baja (VoidedDocuments)
 * 
 * @param payload - Datos de la comunicación de baja
 * @param docId - ID para la firma
 * @returns XML string sin firmar
 */
export function generateVoidedXML(payload: VoidedPayload, docId: string): string {
  const { issuer, issueDate, referenceDate, series, number, lines } = payload;

  // Validaciones básicas
  if (lines.length === 0) {
    throw new Error('La comunicación de baja debe contener al menos un documento');
  }
  if (lines.length > 500) {
    throw new Error('La comunicación de baja no puede contener más de 500 documentos');
  }

  const voidedId = getVoidedId(series, issueDate, number);

  // Crear documento raíz
  const doc = create({ version: '1.0', encoding: 'UTF-8', standalone: false })
    .ele('VoidedDocuments', {
      'xmlns': VOIDED_NAMESPACES.xmlns,
      'xmlns:cac': UBL_NAMESPACES.INVOICE['xmlns:cac'],
      'xmlns:cbc': UBL_NAMESPACES.INVOICE['xmlns:cbc'],
      'xmlns:ds': VOIDED_NAMESPACES['xmlns:ds'],
      'xmlns:ext': UBL_NAMESPACES.INVOICE['xmlns:ext'],
      'xmlns:sac': VOIDED_NAMESPACES['xmlns:sac'],
    });

  // UBL Extensions (placeholder para firma)
  const ublExtensions = doc.ele('ext:UBLExtensions');
  const ublExtension = ublExtensions.ele('ext:UBLExtension');
  ublExtension.ele('ext:ExtensionContent')
    .com('Signature placeholder - will be added by signing process');

  // Versión UBL
  doc.ele('cbc:UBLVersionID').txt('2.0');
  doc.ele('cbc:CustomizationID').txt('1.0');

  // ID de la comunicación de baja
  doc.ele('cbc:ID').txt(voidedId);

  // Fecha de referencia (fecha del documento original)
  doc.ele('cbc:ReferenceDate').txt(formatUBLDate(referenceDate));

  // Fecha de generación
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

  // VoidedDocumentsLine (cada documento a anular)
  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const voidedLine = doc.ele('sac:VoidedDocumentsLine');
    
    // Número de línea
    voidedLine.ele('cbc:LineID').txt(lineNumber.toString());

    // Tipo de documento
    voidedLine.ele('cbc:DocumentTypeCode').txt(line.documentTypeCode);

    // Serie-Número del documento
    const docNumber = line.number.toString().padStart(8, '0');
    voidedLine.ele('sac:DocumentSerialID').txt(line.series);
    voidedLine.ele('sac:DocumentNumberID').txt(docNumber);

    // Motivo de la baja
    voidedLine.ele('sac:VoidReasonDescription').txt(line.voidReason);
  });

  return doc.end({ prettyPrint: true });
}

/**
 * Valida el payload de la comunicación de baja
 */
export function validateVoidedPayload(payload: VoidedPayload): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.issuer?.ruc || payload.issuer.ruc.length !== 11) {
    errors.push('RUC del emisor inválido');
  }

  if (!payload.issuer?.razonSocial) {
    errors.push('Razón social del emisor requerida');
  }

  if (!payload.issueDate) {
    errors.push('Fecha de generación requerida');
  }

  if (!payload.referenceDate) {
    errors.push('Fecha de referencia requerida');
  }

  if (!payload.lines || payload.lines.length === 0) {
    errors.push('Debe incluir al menos un documento a anular');
  }

  if (payload.lines && payload.lines.length > 500) {
    errors.push('Máximo 500 documentos por comunicación de baja');
  }

  // Validar cada línea
  payload.lines?.forEach((line, idx) => {
    if (!line.series) {
      errors.push(`Línea ${idx + 1}: Serie requerida`);
    }
    if (!line.number || line.number <= 0) {
      errors.push(`Línea ${idx + 1}: Número de documento inválido`);
    }
    if (!line.voidReason || line.voidReason.length < 3) {
      errors.push(`Línea ${idx + 1}: Motivo de baja requerido (mínimo 3 caracteres)`);
    }
    if (!line.documentTypeCode) {
      errors.push(`Línea ${idx + 1}: Tipo de documento requerido`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Códigos de tipo de documento para la baja
 */
export const VOIDED_DOC_TYPES = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
} as const;
