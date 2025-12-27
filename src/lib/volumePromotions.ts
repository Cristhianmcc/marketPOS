/**
 * Módulo 14.2-C1: Promociones por Volumen (Pack Fijo)
 * 
 * Calcula descuentos por volumen del tipo "3 unidades por S/ 5.00"
 * Solo aplica a productos UNIT con cantidades enteras.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

interface VolumePromotion {
  id: string;
  name: string;
  type: 'FIXED_PRICE';
  requiredQty: number;
  packPrice: Decimal;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}

interface ComputeVolumePackDiscountParams {
  quantity: number;
  unitPrice: number;
  subtotalAfterCategoryPromo: number;
  volumePromotion: VolumePromotion | null;
  unitType: 'UNIT' | 'KG';
}

interface VolumePackResult {
  discountAmount: number;
  snapshot: {
    volumePromoName: string;
    volumePromoQty: number;
    volumePromoDiscount: Decimal;
  };
}

/**
 * Calcula el descuento por pack fijo
 * 
 * Reglas:
 * 1) Solo productos UNIT
 * 2) Cantidad debe ser entera
 * 3) Cantidad >= requiredQty
 * 4) Descuento nunca negativo
 * 5) Descuento <= subtotalAfterCategoryPromo
 */
export function computeVolumePackDiscount(
  params: ComputeVolumePackDiscountParams
): VolumePackResult | null {
  const {
    quantity,
    unitPrice,
    subtotalAfterCategoryPromo,
    volumePromotion,
    unitType,
  } = params;

  // Validación 1: Solo productos UNIT
  if (unitType !== 'UNIT') {
    return null;
  }

  // Validación 2: Sin promoción activa
  if (!volumePromotion) {
    return null;
  }

  // Validación 3: Cantidad debe ser entera
  if (!Number.isInteger(quantity)) {
    return null;
  }

  // Validación 4: Cantidad menor a la requerida
  if (quantity < volumePromotion.requiredQty) {
    return null;
  }

  // Validación 5: Promoción no vigente
  const now = new Date();
  if (volumePromotion.startsAt && now < volumePromotion.startsAt) {
    return null;
  }
  if (volumePromotion.endsAt && now > volumePromotion.endsAt) {
    return null;
  }

  // Cálculo de packs completos
  const packs = Math.floor(quantity / volumePromotion.requiredQty);
  const normalQty = quantity % volumePromotion.requiredQty;

  // Precio normal sin promoción
  const normalPrice = quantity * unitPrice;

  // Precio con pack
  const packPriceNum = Number(volumePromotion.packPrice);
  const packTotal = packs * packPriceNum;
  const remainingTotal = normalQty * unitPrice;
  const totalWithPack = packTotal + remainingTotal;

  // Descuento
  let discount = normalPrice - totalWithPack;

  // Clamps de seguridad
  if (discount < 0) {
    discount = 0;
  }

  if (discount > subtotalAfterCategoryPromo) {
    discount = subtotalAfterCategoryPromo;
  }

  // Redondeo a 2 decimales
  discount = Math.round(discount * 100) / 100;

  return {
    discountAmount: discount,
    snapshot: {
      volumePromoName: volumePromotion.name,
      volumePromoQty: volumePromotion.requiredQty,
      volumePromoDiscount: new Prisma.Decimal(discount),
    },
  };
}

/**
 * Obtiene la promoción por volumen activa para un producto
 */
export async function getActiveVolumePromotion(
  prisma: any,
  storeId: string,
  productId: string
): Promise<VolumePromotion | null> {
  const now = new Date();

  const promo = await prisma.volumePromotion.findFirst({
    where: {
      storeId,
      productId,
      active: true,
      OR: [
        { startsAt: null, endsAt: null },
        { startsAt: null, endsAt: { gte: now } },
        { startsAt: { lte: now }, endsAt: null },
        { startsAt: { lte: now }, endsAt: { gte: now } },
      ],
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return promo;
}
