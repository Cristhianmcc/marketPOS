/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.2 — UNIDADES AVANZADAS + CONVERSIONES
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Este módulo maneja conversiones de unidades para ferreterías y negocios
 * que venden por peso, longitud, área, o presentaciones (caja, docena, etc.)
 * 
 * PRINCIPIOS F2.2:
 * 1. El inventario SIEMPRE se almacena en unidad base (KGM, MTR, NIU, etc.)
 * 2. Las ventas pueden ser en cualquier unidad configurada (sellUnit)
 * 3. Las conversiones son por (storeId, productMasterId) — NO globales
 * 4. Se guarda snapshot de la conversión en SaleItem para auditoría/SUNAT
 * 5. El precio SIEMPRE es por unidad base: subtotal = baseQty * basePrice
 * 
 * FÓRMULA:
 *   baseQty = sellQty * factorToBase
 *   Ej: 1 BX (caja) con factor 12 => 12 NIU (unidades)
 *   Ej: 150 CMT con factor 0.01 => 1.5 MTR
 * 
 * AISLADO POR FLAG:
 * - ENABLE_ADVANCED_UNITS: Activa UI de unidades avanzadas
 * - ENABLE_CONVERSIONS: Activa conversiones automáticas
 * 
 * Si los flags están OFF, todo funciona como bodega simple (UNIT/KG).
 */

export {
  normalizeToBaseUnit,
  getConversionForProduct,  // ✅ F2.2: Nueva función
  getConversionFactor,      // ⚠️ DEPRECADO
  createProductConversion,  // ⚠️ DEPRECADO
  type ConversionResult,
} from './normalizeToBaseUnit';

export {
  validateQuantityForUnit,
  validateQuantityForProduct,
  hasEnoughStock,
  type QuantityValidation,
} from './validateQuantity';
