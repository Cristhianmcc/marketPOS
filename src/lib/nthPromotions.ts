/**
 * Módulo 14.2-C2: Promociones N-ésimo con Descuento
 * 
 * Calcula descuentos del tipo "2do al 50%", "3ro gratis", "4to al 70%", etc.
 * Solo aplica a productos UNIT con cantidades enteras.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

interface NthPromotion {
  id: string;
  name: string;
  type: 'NTH_PERCENT';
  nthQty: number;          // N (2 = segundo, 3 = tercero, etc.)
  percentOff: Decimal;     // 50.00, 100.00, etc.
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}

interface ComputeNthPromoDiscountParams {
  quantity: number;
  unitPrice: number;
  baseAfterPreviousPromos: number; // subtotal - productPromo - categoryPromo - volumePack
  nthPromotion: NthPromotion | null;
  unitType: 'UNIT' | 'KG';
}

interface NthPromoResult {
  discountAmount: number;
  snapshot: {
    nthPromoName: string;
    nthPromoQty: number;
    nthPromoPercent: Decimal;
    nthPromoDiscount: Decimal;
  };
}

/**
 * Valida si una promoción N-ésimo está vigente según las fechas
 */
function isNthPromoValid(promo: NthPromotion, now: Date): boolean {
  if (promo.startsAt) {
    const startDate = promo.startsAt instanceof Date ? promo.startsAt : new Date(promo.startsAt);
    if (now < startDate) return false;
  }
  if (promo.endsAt) {
    const endDate = promo.endsAt instanceof Date ? promo.endsAt : new Date(promo.endsAt);
    if (now > endDate) return false;
  }
  return true;
}

/**
 * Calcula el descuento por N-ésimo
 * 
 * Reglas:
 * 1) Solo productos UNIT
 * 2) Cantidad debe ser entera
 * 3) Cantidad >= nthQty
 * 4) percentOff entre 0 y 100
 * 5) Descuento nunca negativo
 * 6) Descuento <= baseAfterPreviousPromos
 * 
 * Ejemplos:
 * - 2do al 50%, qty=1 → 0
 * - 2do al 50%, qty=2 → 1 unidad -50%
 * - 2do al 50%, qty=5 → 2 unidades -50%
 * - 3ro gratis, qty=6 → 2 unidades -100%
 */
export function computeNthPromoDiscount(
  params: ComputeNthPromoDiscountParams
): NthPromoResult | null {
  const {
    quantity,
    unitPrice,
    baseAfterPreviousPromos,
    nthPromotion,
    unitType,
  } = params;

  // 1) No hay promoción configurada
  if (!nthPromotion) {
    return null;
  }

  // 2) Solo UNIT
  if (unitType !== 'UNIT') {
    return null;
  }

  // 3) Cantidad debe ser entera
  if (!Number.isInteger(quantity)) {
    return null;
  }

  // 4) Cantidad debe ser >= nthQty
  if (quantity < nthPromotion.nthQty) {
    return null;
  }

  // 5) Validar vigencia
  const now = new Date();
  if (!isNthPromoValid(nthPromotion, now)) {
    return null;
  }

  // 6) Validar percentOff
  const percentOff = Number(nthPromotion.percentOff);
  if (percentOff <= 0 || percentOff > 100) {
    return null;
  }

  // 7) Calcular descuento
  // groups = cuántos grupos completos de N unidades tenemos
  // Cada grupo tiene 1 unidad descontada (la N-ésima)
  const groups = Math.floor(quantity / nthPromotion.nthQty);
  const discountedUnits = groups; // 1 unidad descontada por grupo

  // Descuento por unidad
  const discountPerUnit = unitPrice * (percentOff / 100);
  
  // Descuento total
  let discount = discountedUnits * discountPerUnit;

  // 8) Clamp: descuento no puede ser negativo
  discount = Math.max(0, discount);

  // 9) Clamp: descuento no puede exceder el base
  discount = Math.min(discount, baseAfterPreviousPromos);

  // 10) Redondear a 2 decimales
  discount = Math.round(discount * 100) / 100;

  return {
    discountAmount: discount,
    snapshot: {
      nthPromoName: nthPromotion.name,
      nthPromoQty: nthPromotion.nthQty,
      nthPromoPercent: nthPromotion.percentOff,
      nthPromoDiscount: new Prisma.Decimal(discount),
    },
  };
}

/**
 * Obtiene la promoción N-ésimo activa para un producto (si existe)
 * Solo devuelve la primera promoción activa encontrada
 */
export async function getActiveNthPromotion(
  tx: any, // Prisma transaction client
  storeId: string,
  productId: string
): Promise<NthPromotion | null> {
  const promo = await tx.nthPromotion.findFirst({
    where: {
      storeId,
      productId,
      active: true,
    },
    orderBy: {
      createdAt: 'desc', // Si hay múltiples, tomar la más reciente
    },
  });

  if (!promo) {
    return null;
  }

  return {
    id: promo.id,
    name: promo.name,
    type: promo.type,
    nthQty: promo.nthQty,
    percentOff: promo.percentOff,
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    active: promo.active,
  };
}
