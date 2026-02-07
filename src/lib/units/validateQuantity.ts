/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V2 — VALIDACIÓN DE CANTIDADES
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Valida que las cantidades sean válidas según el tipo de unidad.
 * - Unidades discretas (UNIT, DOZEN): solo enteros
 * - Unidades continuas (KG, M, L): permiten decimales
 * 
 * REGLA: La validación depende del tipo de unidad del producto.
 */

import { prisma } from '@/infra/db/prisma';

/** Códigos de unidades que solo aceptan enteros */
const DISCRETE_UNITS = ['UNIT', 'BOX', 'PACK', 'DOZEN', 'PAIR'];

/** Códigos de unidades que aceptan decimales */
const CONTINUOUS_UNITS = ['KG', 'G', 'M', 'CM', 'MM', 'L', 'ML', 'M2', 'ROLL'];

export interface QuantityValidation {
  valid: boolean;
  /** Cantidad normalizada (redondeada si es necesario) */
  normalizedQuantity: number;
  /** Mensaje de error si no es válida */
  error?: string;
  /** Si la unidad permite decimales */
  allowsDecimals: boolean;
}

/**
 * Valida una cantidad para una unidad específica.
 * 
 * @param quantity - Cantidad a validar
 * @param unitCode - Código de la unidad (ej: 'UNIT', 'KG')
 * @returns Resultado de la validación
 */
export function validateQuantityForUnit(
  quantity: number,
  unitCode: string
): QuantityValidation {
  // Validación básica
  if (quantity <= 0) {
    return {
      valid: false,
      normalizedQuantity: 0,
      error: 'La cantidad debe ser mayor a 0',
      allowsDecimals: false,
    };
  }

  if (!Number.isFinite(quantity)) {
    return {
      valid: false,
      normalizedQuantity: 0,
      error: 'Cantidad inválida',
      allowsDecimals: false,
    };
  }

  const isDiscrete = DISCRETE_UNITS.includes(unitCode);
  const isContinuous = CONTINUOUS_UNITS.includes(unitCode);

  // Si no conocemos la unidad, asumimos discreta (más seguro)
  const allowsDecimals = isContinuous;

  if (isDiscrete) {
    // Unidad discreta: debe ser entero
    if (!Number.isInteger(quantity)) {
      return {
        valid: false,
        normalizedQuantity: Math.round(quantity),
        error: `Para ${unitCode}, la cantidad debe ser un número entero`,
        allowsDecimals: false,
      };
    }
  }

  // Para unidades continuas, limitamos a 3 decimales
  const normalizedQuantity = allowsDecimals
    ? Math.round(quantity * 1000) / 1000
    : Math.round(quantity);

  return {
    valid: true,
    normalizedQuantity,
    allowsDecimals,
  };
}

/**
 * Valida cantidad para un producto específico usando su unidad base.
 * 
 * @param quantity - Cantidad a validar
 * @param productMasterId - ID del ProductMaster
 * @returns Resultado de la validación
 */
export async function validateQuantityForProduct(
  quantity: number,
  productMasterId: string
): Promise<QuantityValidation> {
  const product = await prisma.productMaster.findUnique({
    where: { id: productMasterId },
    include: { baseUnit: true },
  });

  if (!product) {
    return {
      valid: false,
      normalizedQuantity: 0,
      error: 'Producto no encontrado',
      allowsDecimals: false,
    };
  }

  // Si el producto tiene unidad base configurada, usar esa
  if (product.baseUnit) {
    return validateQuantityForUnit(quantity, product.baseUnit.code);
  }

  // Si no tiene unidad base, usar el unitType del producto
  const unitCode = product.unitType;
  return validateQuantityForUnit(quantity, unitCode);
}

/**
 * Verifica si hay suficiente stock para la cantidad solicitada.
 * 
 * @param storeProductId - ID del StoreProduct
 * @param quantityNeeded - Cantidad necesaria (en unidad base)
 * @returns true si hay suficiente stock
 */
export async function hasEnoughStock(
  storeProductId: string,
  quantityNeeded: number
): Promise<{ enough: boolean; available: number }> {
  const storeProduct = await prisma.storeProduct.findUnique({
    where: { id: storeProductId },
    select: { stock: true },
  });

  if (!storeProduct) {
    return { enough: false, available: 0 };
  }

  const available = storeProduct.stock?.toNumber() ?? 0;

  return {
    enough: available >= quantityNeeded,
    available,
  };
}
