// src/lib/coupons.ts
// Lógica de validación y cálculo de cupones

import { CouponType } from "@prisma/client";

export interface Coupon {
  id: string;
  storeId: string;
  code: string;
  type: CouponType;
  value: number;
  minTotal: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
}

export interface ValidatedCoupon {
  discountAmount: number;
  snapshotFields: {
    couponCode: string;
    couponType: CouponType;
    couponValue: number;
  };
}

export interface CouponError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Normaliza un código de cupón
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Valida un cupón y calcula el descuento
 */
export function validateAndComputeCouponDiscount(
  coupon: Coupon | null,
  totalBeforeCoupon: number,
  nowLocalLima: Date
): ValidatedCoupon {
  // 1. Cupón no existe
  if (!coupon) {
    throw {
      code: "COUPON_NOT_FOUND",
      message: "El cupón no existe",
    } as CouponError;
  }

  // 2. Cupón inactivo
  if (!coupon.active) {
    throw {
      code: "COUPON_INACTIVE",
      message: "El cupón está inactivo",
    } as CouponError;
  }

  // 3. Vigencia - startsAt
  if (coupon.startsAt) {
    const startsAt =
      coupon.startsAt instanceof Date
        ? coupon.startsAt
        : new Date(coupon.startsAt);
    if (nowLocalLima < startsAt) {
      throw {
        code: "COUPON_NOT_STARTED",
        message: "El cupón aún no está vigente",
        details: {
          startsAt: startsAt.toISOString(),
          now: nowLocalLima.toISOString(),
        },
      } as CouponError;
    }
  }

  // 4. Vigencia - endsAt
  if (coupon.endsAt) {
    const endsAt =
      coupon.endsAt instanceof Date ? coupon.endsAt : new Date(coupon.endsAt);
    if (nowLocalLima > endsAt) {
      throw {
        code: "COUPON_EXPIRED",
        message: "El cupón ha expirado",
        details: {
          endsAt: endsAt.toISOString(),
          now: nowLocalLima.toISOString(),
        },
      } as CouponError;
    }
  }

  // 5. Mínimo de compra
  if (coupon.minTotal !== null && totalBeforeCoupon < coupon.minTotal) {
    throw {
      code: "COUPON_MIN_NOT_MET",
      message: "El cupón requiere un mínimo de compra",
      details: {
        minTotal: coupon.minTotal,
        totalBeforeCoupon,
      },
    } as CouponError;
  }

  // 6. Máximo de usos
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) {
    throw {
      code: "COUPON_MAX_USES_REACHED",
      message: "El cupón ha alcanzado su límite de usos",
      details: {
        maxUses: coupon.maxUses,
        usesCount: coupon.usesCount,
      },
    } as CouponError;
  }

  // 7. Cálculo del descuento
  let discountAmount = 0;

  if (coupon.type === "PERCENT") {
    // Validar rango de porcentaje
    if (coupon.value <= 0 || coupon.value > 100) {
      throw {
        code: "INVALID_COUPON_VALUE",
        message: "El valor del cupón porcentual es inválido",
        details: { value: coupon.value },
      } as CouponError;
    }
    discountAmount = Math.round((totalBeforeCoupon * coupon.value) / 100 * 100) / 100;
  } else if (coupon.type === "AMOUNT") {
    // Validar que el monto no sea mayor al total
    if (coupon.value <= 0 || coupon.value > totalBeforeCoupon) {
      throw {
        code: "INVALID_COUPON_VALUE",
        message: "El valor del cupón es inválido o mayor al total",
        details: {
          value: coupon.value,
          totalBeforeCoupon,
        },
      } as CouponError;
    }
    discountAmount = coupon.value;
  }

  // 8. Clamp - asegurar que el descuento no exceda el total
  discountAmount = Math.min(discountAmount, totalBeforeCoupon);

  // 9. Asegurar que el total final no sea negativo
  const totalFinal = totalBeforeCoupon - discountAmount;
  if (totalFinal < 0) {
    throw {
      code: "INVALID_COUPON_CALCULATION",
      message: "El cálculo del cupón resultó en un total negativo",
      details: {
        totalBeforeCoupon,
        discountAmount,
        totalFinal,
      },
    } as CouponError;
  }

  return {
    discountAmount: Math.round(discountAmount * 100) / 100,
    snapshotFields: {
      couponCode: coupon.code,
      couponType: coupon.type,
      couponValue: coupon.value,
    },
  };
}
