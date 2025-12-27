// src/lib/categoryPromotions.ts
// Módulo 14.2-B - PROMOCIONES POR CATEGORÍA
// Lógica de cálculo de descuento automático por categoría de producto

import { DiscountType } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';

/**
 * Interfaz para CategoryPromotion con tipos convertidos de Decimal a number
 */
export interface CategoryPromo {
  id: string;
  name: string;
  category: string;
  type: DiscountType;
  value: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  maxDiscountPerItem: number | null;
}

/**
 * Resultado del cálculo de descuento por categoría
 */
export interface CategoryPromoResult {
  discountAmount: number;
  promoSnapshot: {
    name: string;
    type: DiscountType;
  };
}

/**
 * Calcula el descuento por categoría para un ítem
 * Orden: promo producto → promo categoría → descuento manual → descuento global → cupón
 * 
 * @param params - Parámetros del ítem
 * @returns Descuento calculado o null si no aplica
 */
export async function computeCategoryPromoDiscount({
  storeId,
  productCategory,
  quantity,
  unitPrice,
  subtotalAfterProductPromo, // subtotalItem - promotionDiscount
  nowLocalLima = new Date(),
}: {
  storeId: string;
  productCategory: string;
  quantity: number;
  unitPrice: number;
  subtotalAfterProductPromo: number;
  nowLocalLima?: Date;
}): Promise<CategoryPromoResult | null> {
  // Validaciones básicas
  if (!productCategory || subtotalAfterProductPromo <= 0) {
    return null;
  }

  // Buscar promociones activas por categoría (case-insensitive)
  const categoryPromos = await prisma.categoryPromotion.findMany({
    where: {
      storeId,
      category: {
        equals: productCategory,
        mode: 'insensitive',
      },
      active: true,
    },
  });

  if (categoryPromos.length === 0) {
    return null;
  }

  // Filtrar por vigencia y calcular descuentos
  const validPromos: Array<{
    promo: CategoryPromo;
    discountAmount: number;
  }> = [];

  for (const promoData of categoryPromos) {
    // Validar vigencia
    if (promoData.startsAt && nowLocalLima < new Date(promoData.startsAt)) {
      continue; // No ha iniciado
    }
    if (promoData.endsAt && nowLocalLima > new Date(promoData.endsAt)) {
      continue; // Ya expiró
    }

    // Convertir Decimal a number
    const promo: CategoryPromo = {
      ...promoData,
      value: Number(promoData.value),
      maxDiscountPerItem: promoData.maxDiscountPerItem
        ? Number(promoData.maxDiscountPerItem)
        : null,
    };

    // Calcular descuento según tipo
    let discountAmount = 0;

    if (promo.type === 'PERCENT') {
      // Validar rango de porcentaje
      if (promo.value <= 0 || promo.value > 100) {
        continue; // Valor inválido
      }

      // Calcular porcentaje sobre el subtotal después de promo producto
      discountAmount = Math.round((subtotalAfterProductPromo * promo.value) / 100 * 100) / 100;
    } else if (promo.type === 'AMOUNT') {
      // Validar valor positivo
      if (promo.value <= 0) {
        continue; // Valor inválido
      }

      // Descuento fijo por unidad * cantidad
      discountAmount = promo.value * quantity;

      // No puede superar el subtotal
      discountAmount = Math.min(discountAmount, subtotalAfterProductPromo);
    }

    // Aplicar tope opcional por ítem
    if (promo.maxDiscountPerItem !== null) {
      // El tope se aplica POR UNIDAD, entonces multiplicamos por quantity
      const maxTotalDiscount = promo.maxDiscountPerItem * quantity;
      discountAmount = Math.min(discountAmount, maxTotalDiscount);
    }

    // Clamp: nunca negativo, nunca mayor al subtotal
    discountAmount = Math.max(0, Math.min(discountAmount, subtotalAfterProductPromo));

    // Guardar promo válida con su descuento
    if (discountAmount > 0) {
      validPromos.push({ promo, discountAmount });
    }
  }

  // Si no hay promos válidas, retornar null
  if (validPromos.length === 0) {
    return null;
  }

  // Seleccionar la promo que da MAYOR descuento
  const bestPromo = validPromos.reduce((best, current) =>
    current.discountAmount > best.discountAmount ? current : best
  );

  return {
    discountAmount: bestPromo.discountAmount,
    promoSnapshot: {
      name: bestPromo.promo.name,
      type: bestPromo.promo.type,
    },
  };
}
