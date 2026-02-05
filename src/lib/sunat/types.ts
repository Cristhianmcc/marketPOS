// src/lib/sunat/types.ts
// ✅ MÓDULO 18.2: Tipos para el payload fiscal SUNAT
// Este payload representa los datos que se usarán para generar XML UBL 2.1

import { SunatDocType, SunatEnv, CustomerDocType } from '@prisma/client';

/**
 * Datos del emisor (contribuyente que emite el comprobante)
 * Se obtienen de SunatSettings
 */
export interface SunatIssuer {
  ruc: string;
  razonSocial: string;
  address: string | null;
  ubigeo?: string | null; // Código de ubigeo (opcional)
  env: SunatEnv; // BETA o PROD
}

/**
 * Datos del receptor (cliente que recibe el comprobante)
 * Se obtienen de Sale o del input del usuario
 */
export interface SunatCustomer {
  docType: CustomerDocType; // DNI, RUC, CE, PASSPORT
  docNumber: string;
  name: string;
  address?: string | null; // Requerido para FACTURA con RUC
}

/**
 * Línea de ítem del comprobante
 * Representa un producto/servicio vendido
 */
export interface SunatLineItem {
  /** Número de orden del ítem (1, 2, 3...) */
  lineNumber: number;
  
  /** Descripción del producto (nombre + contenido) */
  description: string;
  
  /** Cantidad vendida */
  quantity: number;
  
  /** Precio unitario (incluye IGV si es precio final) */
  unitPrice: number;
  
  /** Subtotal de la línea (quantity * unitPrice - descuentos aplicados) */
  lineSubtotal: number;
  
  /** Descuentos aplicados a esta línea (opcional, para referencia en PDF) */
  discountsApplied?: number;
  
  /** Tipo de unidad (UNIT, KG, etc.) */
  unitType?: string;
  
  /** SKU interno del producto (opcional) */
  internalSku?: string | null;
  
  /** Código de barras (opcional) */
  barcode?: string | null;
}

/**
 * Totales del comprobante
 * Se obtienen directamente de Sale (NO se recalculan)
 */
export interface SunatTotals {
  /** Subtotal gravado (base imponible para IGV) */
  subtotal: number;
  
  /** IGV (18% en Perú) */
  tax: number;
  
  /** Total del comprobante (subtotal + tax) */
  total: number;
  
  /** Moneda (siempre PEN para MVP) */
  currency: 'PEN';
}

/**
 * Payload completo del documento fiscal
 * Este es el "snapshot" de los datos que se usarán para generar el XML
 */
export interface SunatDocumentPayload {
  /** Datos del emisor */
  issuer: SunatIssuer;
  
  /** Datos del receptor */
  customer: SunatCustomer;
  
  /** Ítems del comprobante */
  items: SunatLineItem[];
  
  /** Totales */
  totals: SunatTotals;
  
  /** Metadata del documento */
  metadata: {
    /** Tipo de documento */
    docType: SunatDocType;
    
    /** Serie del comprobante (F001, B001, etc.) */
    series: string;
    
    /** Número correlativo */
    number: number;
    
    /** Número completo (serie + número) */
    fullNumber: string;
    
    /** Fecha de emisión */
    issueDate: Date;
    
    /** ID de la venta asociada (opcional) */
    saleId?: string | null;
    
    /** ID del documento electrónico (si ya existe) */
    documentId?: string;
  };
}

/**
 * Errores específicos del módulo SUNAT
 */
export class SunatError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SunatError';
  }
}

/**
 * Códigos de error SUNAT
 */
export const SunatErrorCodes = {
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  SUNAT_SETTINGS_REQUIRED: 'SUNAT_SETTINGS_REQUIRED',
  SUNAT_NOT_ENABLED: 'SUNAT_NOT_ENABLED',
  SUNAT_SETTINGS_INCOMPLETE: 'SUNAT_SETTINGS_INCOMPLETE',
  INVALID_CUSTOMER_RUC: 'INVALID_CUSTOMER_RUC',
  INVALID_CUSTOMER_DATA: 'INVALID_CUSTOMER_DATA',
  SALE_NOT_FOUND: 'SALE_NOT_FOUND',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  STORE_ARCHIVED: 'STORE_ARCHIVED',
} as const;
