// Tipos específicos para UBL 2.1
export interface UBLNamespaces {
  xmlns: string;
  'xmlns:cac': string;
  'xmlns:cbc': string;
  'xmlns:ccts': string;
  'xmlns:ds': string;
  'xmlns:ext': string;
  'xmlns:qdt': string;
  'xmlns:sac': string;
  'xmlns:udt': string;
  'xmlns:xsi': string;
  'xsi:schemaLocation': string;
}

export const UBL_NAMESPACES: Record<string, UBLNamespaces> = {
  INVOICE: {
    xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'xmlns:ccts': 'urn:un:unece:uncefact:documentation:2',
    'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
    'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'xmlns:qdt': 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2',
    'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
    'xmlns:udt': 'urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  },
  CREDIT_NOTE: {
    xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
    'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'xmlns:ccts': 'urn:un:unece:uncefact:documentation:2',
    'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
    'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'xmlns:qdt': 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2',
    'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
    'xmlns:udt': 'urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  },
  DEBIT_NOTE: {
    xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
    'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'xmlns:ccts': 'urn:un:unece:uncefact:documentation:2',
    'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
    'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'xmlns:qdt': 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2',
    'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
    'xmlns:udt': 'urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
  },
};

// Códigos de catálogo SUNAT
export const SUNAT_CATALOGS = {
  // Catálogo 01: Tipo de documento (InvoiceTypeCode)
  DOC_TYPE: {
    FACTURA: '01',
    BOLETA: '03',
    NOTA_CREDITO: '07',
    NOTA_DEBITO: '08',
    GUIA_REMISION: '09',
    RECIBO_SERVICIOS: '12',
  },

  // Catálogo 05: Tipo de tributo (TaxScheme)
  TAX_TYPE: {
    IGV: '1000', // Impuesto General a las Ventas
    ISC: '2000', // Impuesto Selectivo al Consumo
    OTROS: '9999',
  },

  // Catálogo 06: Tipo de documento de identidad
  CUSTOMER_DOC_TYPE: {
    DNI: '1',
    RUC: '6',
    CARNET_EXTRANJERIA: '4',
    PASAPORTE: '7',
    CEDULA_DIPLOMATICA: 'A',
  },

  // Catálogo 07: Tipo de afectación del IGV
  IGV_AFFECTATION: {
    GRAVADO_OPERACION_ONEROSA: '10', // Gravado - Operación Onerosa
    GRAVADO_RETIRO: '11',
    GRAVADO_OPERACION_GRATUITA: '12',
    GRAVADO_SERVICIO_PRESTADO_NO_DOMICILIADO: '13',
    GRAVADO_VENTA_ARROZ_PILADO: '14',
    GRAVADO_VENTA_BIENES_LEY_1034: '15',
    GRAVADO_IVAP: '16',
    EXONERADO: '20',
    INAFECTO: '30',
    EXPORTACION: '40',
  },

  // Catálogo 09: Tipo de nota de crédito
  CREDIT_NOTE_TYPE: {
    ANULACION_OPERACION: '01',
    ANULACION_ERRORES_DESCRIPCION: '02',
    DESCUENTO_GLOBAL: '03',
    DESCUENTO_ITEM: '04',
    DEVOLUCION_TOTAL: '05',
    DEVOLUCION_PARCIAL: '06',
    BONIFICACION: '07',
    DISMINUCION_VALOR: '08',
    OTROS: '09',
  },

  // Catálogo 10: Tipo de nota de débito
  DEBIT_NOTE_TYPE: {
    INTERES_MORA: '01',
    AUMENTO_VALOR: '02',
    PENALIDADES: '03',
    OTROS: '10',
  },

  // Catálogo 51: Tipo de operación
  OPERATION_TYPE: {
    VENTA_INTERNA: '0101',
    EXPORTACION: '0200',
    NO_DOMICILIADOS: '0401',
    VENTA_INTERNA_ANTICIPOS: '1001',
  },
};

// Unidades de medida (Catálogo 03)
export const UNIT_CODES = {
  NIU: 'NIU', // Unidad (pieza)
  KGM: 'KGM', // Kilogramo
  LTR: 'LTR', // Litro
  MTR: 'MTR', // Metro
  ZZ: 'ZZ',   // Unidad (Servicios)
};

export type UnitCode = keyof typeof UNIT_CODES;

// ✅ MÓDULO 18.6: Namespaces para Summary y Voided (no UBL, formato SUNAT específico)
export interface SunatDocNamespaces {
  xmlns: string;
  'xmlns:sac'?: string;
  'xmlns:ds'?: string;
}

// Summary Documents (Resumen Diario) usa formato SUNAT específico, no UBL
export const SUMMARY_NAMESPACES: SunatDocNamespaces = {
  xmlns: 'urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1',
  'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
  'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
};

// Voided Documents (Comunicación de Baja) usa formato SUNAT específico
export const VOIDED_NAMESPACES: SunatDocNamespaces = {
  xmlns: 'urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1',
  'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
  'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
};

// Catálogo 12: Código de tipo de documento - Resumen
export const SUMMARY_DOC_TYPES = {
  BOLETA: '03',
  NOTA_CREDITO_BOLETA: '07',
  NOTA_DEBITO_BOLETA: '08',
};

// Catálogo 19: Estado del item en el resumen
export const SUMMARY_STATUS = {
  ADICIONAR: '1',  // Nuevo documento a informar
  MODIFICAR: '2',  // Corrección a un documento informado antes
  ANULAR: '3',     // Anulación de un documento informado antes
};
