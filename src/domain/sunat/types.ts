// src/domain/sunat/types.ts
// ✅ MÓDULO 18.1: Tipos y constantes para Facturación Electrónica SUNAT

import { 
  SunatDocType, 
  SunatStatus, 
  SunatEnv, 
  CustomerDocType 
} from '@prisma/client';

/**
 * Mapa de códigos oficiales SUNAT por tipo de documento
 */
export const SUNAT_DOC_CODE_MAP: Record<SunatDocType, string> = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
  SUMMARY: 'RC', // Resumen diario
  VOIDED: 'RA',  // Comunicación de baja
};

/**
 * Input para crear un documento electrónico en estado DRAFT
 */
export interface CreateElectronicDocumentInput {
  storeId: string;
  saleId?: string;
  docType: SunatDocType;
  customer: {
    docType: CustomerDocType;
    docNumber: string;
    name: string;
    address?: string;
  };
  totals: {
    taxable: number;  // Base imponible
    igv: number;      // IGV
    total: number;    // Total
  };
  issueDate?: Date;
}

/**
 * Resultado de la creación de un documento electrónico
 */
export interface ElectronicDocumentDraft {
  id: string;
  storeId: string;
  saleId?: string;
  docType: SunatDocType;
  series: string;
  number: number;
  fullNumber: string;
  issueDate: Date;
  currency: string;
  customerDocType: CustomerDocType;
  customerDocNumber: string;
  customerName: string;
  customerAddress?: string;
  taxable: number;
  igv: number;
  total: number;
  status: SunatStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tipo de trabajo SUNAT
 */
export enum SunatJobType {
  SEND_CPE = 'SEND_CPE',           // Enviar comprobante electrónico
  SEND_SUMMARY = 'SEND_SUMMARY',   // Enviar resumen diario
  SEND_VOIDED = 'SEND_VOIDED',     // Enviar comunicación de baja
  QUERY_TICKET = 'QUERY_TICKET',   // Consultar ticket de resumen/baja
}

/**
 * Estado de un trabajo SUNAT
 */
export enum SunatJobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}
