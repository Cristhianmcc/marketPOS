/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.2 — CONVERSIÓN DE UNIDADES (unidad venta → unidad base)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Convierte cantidades de unidades de venta a unidades base.
 * Ejemplo: 1 CAJA → 12 UNIDADES, 150 CM → 1.5 M, 500 ML → 0.5 L
 * 
 * REGLA DE ORO:
 * - El inventario SIEMPRE se almacena en unidad base.
 * - Las conversiones son por (tienda, producto).
 * - El precio es SIEMPRE por unidad base: subtotal = baseQty * basePrice.
 * 
 * FÓRMULA:
 *   baseQty = sellQty * factorToBase
 *   Ej: 1 BX con factor 12 => 1 * 12 = 12 NIU
 *   Ej: 150 CMT con factor 0.01 => 150 * 0.01 = 1.5 MTR
 */

import { prisma } from '@/infra/db/prisma';
import { RoundingMode } from '@prisma/client';

export interface ConversionResult {
  /** Si la conversión fue exitosa */
  success: boolean;
  /** Cantidad convertida a unidad base */
  quantityBase: number;
  /** Factor de conversión aplicado */
  factor: number;
  /** Código de la unidad base */
  baseUnitCode: string;
  /** Código SUNAT de la unidad de venta */
  sellUnitSunatCode?: string;
  /** Código SUNAT de la unidad base */
  baseUnitSunatCode?: string;
  /** Modo de redondeo aplicado */
  roundingMode?: RoundingMode;
  /** Mensaje de error si falló */
  error?: string;
}

/**
 * Aplica el redondeo según el modo configurado.
 */
function applyRounding(value: number, mode: RoundingMode, precision: number = 6): number {
  const factor = Math.pow(10, precision);
  switch (mode) {
    case 'ROUND':
      return Math.round(value * factor) / factor;
    case 'CEIL':
      return Math.ceil(value * factor) / factor;
    case 'FLOOR':
      return Math.floor(value * factor) / factor;
    case 'NONE':
    default:
      return value;
  }
}

/**
 * Obtiene el factor de conversión para una tienda y producto específicos.
 * 
 * @param storeId - ID de la tienda
 * @param productMasterId - ID del producto
 * @param fromUnitId - ID de la unidad de venta
 * @param toUnitId - ID de la unidad base
 * @returns Conversión con factor y roundingMode, o null si no existe
 */
export async function getConversionForProduct(
  storeId: string,
  productMasterId: string,
  fromUnitId: string,
  toUnitId: string
): Promise<{ factor: number; roundingMode: RoundingMode } | null> {
  // Si son la misma unidad, factor es 1
  if (fromUnitId === toUnitId) {
    return { factor: 1, roundingMode: 'NONE' };
  }

  // Buscar conversión específica (storeId, productMasterId, fromUnitId, toUnitId)
  const conversion = await prisma.unitConversion.findUnique({
    where: {
      storeId_productMasterId_fromUnitId_toUnitId: {
        storeId,
        productMasterId,
        fromUnitId,
        toUnitId,
      },
    },
  });

  if (conversion && conversion.active) {
    return {
      factor: conversion.factorToBase.toNumber(),
      roundingMode: conversion.roundingMode,
    };
  }

  return null;
}

/**
 * Convierte una cantidad de unidad de venta a unidad base.
 * 
 * PARÁMETROS CRÍTICOS:
 * - storeId: Obligatorio para F2.2 (conversiones por tienda)
 * - productMasterId: Obligatorio (conversiones por producto)
 * 
 * @param quantity - Cantidad en la unidad de venta (sellQty)
 * @param saleUnitId - ID de la unidad de venta (fromUnit)
 * @param baseUnitId - ID de la unidad base del producto (toUnit)
 * @param storeId - ID de la tienda (requerido para F2.2)
 * @param productMasterId - ID del producto (requerido para F2.2)
 * @returns Resultado de la conversión
 */
export async function normalizeToBaseUnit(
  quantity: number,
  saleUnitId: string,
  baseUnitId: string,
  storeId?: string,
  productMasterId?: string
): Promise<ConversionResult> {
  // Validar cantidad positiva
  if (quantity <= 0) {
    return {
      success: false,
      quantityBase: 0,
      factor: 1,
      baseUnitCode: '',
      error: 'La cantidad debe ser mayor a 0',
    };
  }

  // Obtener unidad base
  const baseUnit = await prisma.unit.findUnique({
    where: { id: baseUnitId },
  });

  if (!baseUnit) {
    return {
      success: false,
      quantityBase: 0,
      factor: 1,
      baseUnitCode: '',
      error: 'Unidad base no encontrada',
    };
  }

  // Si es la misma unidad, no hay conversión
  if (saleUnitId === baseUnitId) {
    return {
      success: true,
      quantityBase: quantity,
      factor: 1,
      baseUnitCode: baseUnit.code,
      baseUnitSunatCode: baseUnit.sunatCode ?? undefined,
      roundingMode: 'NONE',
    };
  }

  // Obtener unidad de venta
  const saleUnit = await prisma.unit.findUnique({
    where: { id: saleUnitId },
  });

  if (!saleUnit) {
    return {
      success: false,
      quantityBase: 0,
      factor: 1,
      baseUnitCode: baseUnit.code,
      error: 'Unidad de venta no encontrada',
    };
  }

  // ✅ F2.2: Buscar conversión por (storeId, productMasterId)
  if (!storeId || !productMasterId) {
    return {
      success: false,
      quantityBase: 0,
      factor: 1,
      baseUnitCode: baseUnit.code,
      error: 'storeId y productMasterId requeridos para conversiones',
    };
  }

  const conversion = await getConversionForProduct(
    storeId,
    productMasterId,
    saleUnitId,
    baseUnitId
  );

  if (!conversion) {
    return {
      success: false,
      quantityBase: 0,
      factor: 1,
      baseUnitCode: baseUnit.code,
      sellUnitSunatCode: saleUnit.sunatCode ?? undefined,
      baseUnitSunatCode: baseUnit.sunatCode ?? undefined,
      error: `NO_CONVERSION_AVAILABLE: No existe conversión de ${saleUnit.displayName || saleUnit.name} (${saleUnit.sunatCode}) a ${baseUnit.displayName || baseUnit.name} (${baseUnit.sunatCode}) para este producto`,
    };
  }

  // Calcular cantidad base
  let quantityBase = quantity * conversion.factor;
  
  // Aplicar redondeo si está configurado
  if (conversion.roundingMode !== 'NONE') {
    quantityBase = applyRounding(quantityBase, conversion.roundingMode, 6);
  }

  // Validar que el resultado no sea extremadamente pequeño
  if (quantityBase <= 0.000001) {
    return {
      success: false,
      quantityBase: 0,
      factor: conversion.factor,
      baseUnitCode: baseUnit.code,
      error: 'La cantidad base calculada es demasiado pequeña',
    };
  }

  // ✅ EDGE CASE: Si unidad base no permite decimales, verificar que quantityBase sea entero
  if (!baseUnit.allowDecimals && !Number.isInteger(quantityBase)) {
    return {
      success: false,
      quantityBase: 0,
      factor: conversion.factor,
      baseUnitCode: baseUnit.code,
      error: `INVALID_BASE_QUANTITY: ${baseUnit.displayName} no permite decimales. ${quantity} ${saleUnit.symbol} = ${quantityBase} ${baseUnit.symbol}`,
    };
  }

  return {
    success: true,
    quantityBase,
    factor: conversion.factor,
    baseUnitCode: baseUnit.code,
    sellUnitSunatCode: saleUnit.sunatCode ?? undefined,
    baseUnitSunatCode: baseUnit.sunatCode ?? undefined,
    roundingMode: conversion.roundingMode,
  };
}

// ⚠️ DEPRECADO: getConversionFactor sin storeId ya no funciona en F2.2
// Mantenido solo para compatibilidad temporal
export async function getConversionFactor(
  fromUnitId: string,
  toUnitId: string,
  _productMasterId?: string
): Promise<number | null> {
  console.warn('getConversionFactor está deprecado. Usa getConversionForProduct con storeId.');
  if (fromUnitId === toUnitId) {
    return 1;
  }
  return null;
}

// ⚠️ DEPRECADO: createProductConversion ya no se usa
// Las conversiones se crean vía API /api/units/conversions
export async function createProductConversion(
  _productMasterId: string,
  _fromUnitId: string,
  _toUnitId: string,
  _factor: number
): Promise<void> {
  console.warn('createProductConversion está deprecado. Usa POST /api/units/conversions');
}
