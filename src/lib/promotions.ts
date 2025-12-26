// src/lib/promotions.ts
import { PromotionType } from '@prisma/client';

export interface Promotion {
  id: string;
  type: PromotionType;
  name: string;
  active: boolean;
  productId: string | null;
  minQty: number | null;
  packPrice: number | null;
  happyStart: Date | null;
  happyEnd: Date | null;
  happyPrice: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface AppliedPromotion {
  promotionType: PromotionType;
  promotionName: string;
  promotionDiscount: number;
}

/**
 * Verifica si una promoción está vigente según las fechas/horas
 */
export function isPromotionValid(promo: Promotion, now: Date): boolean {
  // Verificar vigencia general (startsAt / endsAt)
  if (promo.startsAt) {
    const startDate = promo.startsAt instanceof Date ? promo.startsAt : new Date(promo.startsAt);
    if (now < startDate) return false;
  }
  if (promo.endsAt) {
    const endDate = promo.endsAt instanceof Date ? promo.endsAt : new Date(promo.endsAt);
    if (now > endDate) return false;
  }

  // Verificar happy hour (si aplica)
  if (promo.type === 'HAPPY_HOUR') {
    if (!promo.happyStart || !promo.happyEnd) return false;
    
    // Convertir a Date si es string
    const happyStartDate = promo.happyStart instanceof Date ? promo.happyStart : new Date(promo.happyStart);
    const happyEndDate = promo.happyEnd instanceof Date ? promo.happyEnd : new Date(promo.happyEnd);
    
    // Comparar solo hora:minuto:segundo (ignorar fecha)
    const nowTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const startTime = happyStartDate.getHours() * 3600 + happyStartDate.getMinutes() * 60 + happyStartDate.getSeconds();
    const endTime = happyEndDate.getHours() * 3600 + happyEndDate.getMinutes() * 60 + happyEndDate.getSeconds();
    
    if (nowTime < startTime || nowTime > endTime) return false;
  }

  return true;
}

/**
 * Calcula el descuento de una promoción 2x1
 */
function calculateTwoForOne(quantity: number, unitPrice: number, minQty: number): number {
  if (quantity < minQty) return 0;
  const pairs = Math.floor(quantity / minQty);
  return unitPrice * pairs;
}

/**
 * Calcula el descuento de un pack price
 */
function calculatePackPrice(
  quantity: number,
  unitPrice: number,
  minQty: number,
  packPrice: number
): number {
  if (quantity < minQty) return 0;
  const packCount = Math.floor(quantity / minQty);
  const normalPrice = packCount * minQty * unitPrice;
  const discountedPrice = packCount * packPrice;
  return Math.max(0, normalPrice - discountedPrice);
}

/**
 * Calcula el descuento de happy hour
 */
function calculateHappyHour(quantity: number, unitPrice: number, happyPrice: number): number {
  if (happyPrice >= unitPrice) return 0;
  return (unitPrice - happyPrice) * quantity;
}

/**
 * Aplica la mejor promoción disponible a un ítem
 * Prioridad: HAPPY_HOUR > PACK_PRICE > TWO_FOR_ONE
 */
export function applyBestPromotion(
  productId: string,
  quantity: number,
  unitPrice: number,
  subtotalItem: number,
  promotions: Promotion[]
): AppliedPromotion | null {
  const now = new Date(); // Usar hora local America/Lima (asumiendo servidor configurado correctamente)

  // Filtrar promociones válidas para este producto
  const validPromos = promotions.filter(
    (p) =>
      p.active &&
      (p.productId === null || p.productId === productId) &&
      isPromotionValid(p, now)
  );

  if (validPromos.length === 0) return null;

  // Calcular descuento de cada promoción y elegir la mejor (mayor descuento)
  const promosWithDiscounts = validPromos.map((promo) => {
    let discount = 0;

    switch (promo.type) {
      case 'TWO_FOR_ONE':
        if (promo.minQty) {
          discount = calculateTwoForOne(quantity, unitPrice, promo.minQty);
        }
        break;

      case 'PACK_PRICE':
        if (promo.minQty && promo.packPrice) {
          discount = calculatePackPrice(quantity, unitPrice, promo.minQty, promo.packPrice);
        }
        break;

      case 'HAPPY_HOUR':
        if (promo.happyPrice) {
          discount = calculateHappyHour(quantity, unitPrice, promo.happyPrice);
        }
        break;
    }

    return { promo, discount };
  });

  // Filtrar solo las que tienen descuento válido
  const validDiscounts = promosWithDiscounts.filter(
    (p) => p.discount > 0 && p.discount <= subtotalItem
  );

  if (validDiscounts.length === 0) return null;

  // Ordenar por descuento (mayor primero)
  validDiscounts.sort((a, b) => b.discount - a.discount);

  // Retornar la mejor promoción
  const best = validDiscounts[0];
  return {
    promotionType: best.promo.type,
    promotionName: best.promo.name,
    promotionDiscount: best.discount,
  };
}
