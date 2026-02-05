// Helpers comunes para generación UBL 2.1
import { format } from 'date-fns';

/**
 * Formatea una fecha para UBL (YYYY-MM-DD)
 */
export function formatUBLDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Formatea una hora para UBL (HH:mm:ss)
 */
export function formatUBLTime(date: Date): string {
  return format(date, 'HH:mm:ss');
}

/**
 * Formatea un monto para UBL (máximo 2 decimales)
 */
export function formatUBLAmount(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toFixed(2);
}

/**
 * Formatea una cantidad para UBL (máximo 10 decimales, sin trailing zeros)
 */
export function formatUBLQuantity(quantity: number | string): string {
  const num = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  // Eliminar decimales innecesarios
  return num.toFixed(10).replace(/\.?0+$/, '');
}

/**
 * Convierte un tipo de documento interno a código de catálogo SUNAT
 */
export function mapDocTypeToSunat(docType: string): string {
  const mapping: Record<string, string> = {
    FACTURA: '01',
    BOLETA: '03',
    NOTA_CREDITO: '07',
    NOTA_DEBITO: '08',
  };
  return mapping[docType] || docType;
}

/**
 * Convierte un tipo de documento de cliente a código de catálogo SUNAT
 */
export function mapCustomerDocTypeToSunat(docType: string): string {
  const mapping: Record<string, string> = {
    DNI: '1',
    RUC: '6',
    CE: '4',
    PASSPORT: '7',
    CARNET_EXTRANJERIA: '4',
    PASAPORTE: '7',
  };
  return mapping[docType] || '1'; // Default DNI
}

/**
 * Genera el ID de UBL (RUC-TIPO-SERIE-NUMERO)
 * Ejemplo: 20123456789-01-F001-00000001
 */
export function generateUBLId(ruc: string, docType: string, series: string, number: number): string {
  const sunatDocType = mapDocTypeToSunat(docType);
  const paddedNumber = number.toString().padStart(8, '0');
  return `${ruc}-${sunatDocType}-${series}-${paddedNumber}`;
}

/**
 * Calcula el hash de un XML (sin firma) para logging/auditoría
 */
export function calculateXmlHash(xml: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(xml).digest('hex');
}

/**
 * Valida que un RUC sea válido (11 dígitos, empieza con 10 o 20)
 */
export function isValidRUC(ruc: string): boolean {
  return /^(10|20)\d{9}$/.test(ruc);
}

/**
 * Valida que un DNI sea válido (8 dígitos)
 */
export function isValidDNI(dni: string): boolean {
  return /^\d{8}$/.test(dni);
}

/**
 * Obtiene el código de moneda (siempre PEN para Perú)
 */
export function getCurrencyCode(currency?: string): string {
  return currency || 'PEN';
}

/**
 * Obtiene el tipo de operación por defecto (Venta interna)
 */
export function getDefaultOperationType(): string {
  return '0101'; // Venta interna
}

/**
 * Obtiene la versión UBL 2.1
 */
export function getUBLVersion(): string {
  return '2.1';
}

/**
 * Obtiene el CustomizationID según el tipo de documento
 * Estos valores son requeridos por SUNAT
 */
export function getCustomizationId(docType: string): string {
  const sunatDocType = mapDocTypeToSunat(docType);
  
  switch (sunatDocType) {
    case '01': // FACTURA
    case '03': // BOLETA
      return '2.0';
    case '07': // NOTA CREDITO
    case '08': // NOTA DEBITO
      return '2.0';
    default:
      return '2.0';
  }
}

/**
 * Mapea el tipo de unidad del producto a código UBL
 */
export function mapUnitTypeToUBL(unitType?: string): string {
  if (!unitType) return 'NIU'; // Default: Unidad
  
  const mapping: Record<string, string> = {
    UNIT: 'NIU',
    KG: 'KGM',
    LITER: 'LTR',
    METER: 'MTR',
    SERVICE: 'ZZ',
  };
  
  return mapping[unitType.toUpperCase()] || 'NIU';
}

/**
 * Obtiene el código de afectación IGV (por defecto gravado)
 */
export function getDefaultIGVAffectation(): string {
  return '10'; // Gravado - Operación Onerosa
}

/**
 * Calcula el porcentaje de IGV (18%)
 */
export function getIGVPercentage(): number {
  return 18;
}

/**
 * Valida que los totales sean consistentes
 */
export function validateTotals(subtotal: number, tax: number, total: number): boolean {
  const calculatedTotal = subtotal + tax;
  const diff = Math.abs(calculatedTotal - total);
  return diff < 0.01; // Tolerancia de 1 centavo por redondeo
}
