/**
 * Funciones de cálculo puras para el POS
 * Sin dependencias de React, solo lógica matemática
 */

import type { CartItem, AppliedCoupon } from './posTypes';

/**
 * Calcula el subtotal de un item (cantidad * precio)
 */
export function calculateItemSubtotal(item: CartItem): number {
  return item.quantity * item.storeProduct.price;
}

/**
 * Obtiene el descuento de promoción de producto
 */
export function calculateItemPromotion(item: CartItem): number {
  return item.promotionDiscount ?? 0;
}

/**
 * Obtiene el descuento de promoción por categoría
 */
export function calculateItemCategoryPromo(item: CartItem): number {
  return item.categoryPromoDiscount ?? 0;
}

/**
 * Calcula el descuento manual del item
 */
export function calculateItemDiscount(item: CartItem): number {
  if (!item.discountType || !item.discountValue) return 0;
  
  const subtotal = calculateItemSubtotal(item);
  const productPromotion = calculateItemPromotion(item);
  const categoryPromotion = calculateItemCategoryPromo(item);
  const volumePromotion = item.volumePromoDiscount ?? 0;
  const nthPromotion = item.nthPromoDiscount ?? 0;
  // Base para descuento manual = subtotal - promociones
  const subtotalAfterPromos = subtotal - productPromotion - categoryPromotion - volumePromotion - nthPromotion;
  
  if (item.discountType === 'PERCENT') {
    return Math.round((subtotalAfterPromos * item.discountValue) / 100 * 100) / 100;
  } else {
    return item.discountValue;
  }
}

/**
 * Calcula el total de un item después de todos los descuentos
 */
export function calculateItemTotal(item: CartItem): number {
  const subtotal = calculateItemSubtotal(item);
  const productPromotion = calculateItemPromotion(item);
  const categoryPromotion = calculateItemCategoryPromo(item);
  const volumePromotion = item.volumePromoDiscount ?? 0;
  const nthPromotion = item.nthPromoDiscount ?? 0;
  const manualDiscount = calculateItemDiscount(item);
  return subtotal - productPromotion - categoryPromotion - volumePromotion - nthPromotion - manualDiscount;
}

/**
 * Obtiene el total de items en el carrito
 */
export function getTotalItems(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Obtiene el subtotal antes de descuentos
 */
export function getSubtotalBeforeDiscounts(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
}

/**
 * Total de promociones de producto
 */
export function getTotalPromotions(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + calculateItemPromotion(item), 0);
}

/**
 * Total de promociones por categoría
 */
export function getTotalCategoryPromotions(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + (item.categoryPromoDiscount ?? 0), 0);
}

/**
 * Total de promociones por volumen
 */
export function getTotalVolumePromotions(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + (item.volumePromoDiscount ?? 0), 0);
}

/**
 * Total de promociones nth
 */
export function getTotalNthPromotions(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + (item.nthPromoDiscount ?? 0), 0);
}

/**
 * Total de descuentos manuales de items
 */
export function getTotalItemDiscounts(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + calculateItemDiscount(item), 0);
}

/**
 * Total del carrito incluyendo cupón y descuento global
 */
export function getCartTotal(
  cart: CartItem[], 
  globalDiscount: number, 
  appliedCoupon: AppliedCoupon | null
): number {
  const subtotalAfterItemDiscounts = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const totalBeforeCoupon = subtotalAfterItemDiscounts - globalDiscount;
  const couponDiscount = appliedCoupon?.discount ?? 0;
  return totalBeforeCoupon - couponDiscount;
}

/**
 * Total antes de aplicar cupón
 */
export function getTotalBeforeCoupon(cart: CartItem[], globalDiscount: number): number {
  const subtotalAfterItemDiscounts = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  return subtotalAfterItemDiscounts - globalDiscount;
}
