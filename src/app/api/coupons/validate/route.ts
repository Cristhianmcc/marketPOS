// src/app/api/coupons/validate/route.ts
// Validar cupón antes de checkout (para feedback UI en tiempo real)

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/infra/db/prisma";
import {
  normalizeCouponCode,
  validateAndComputeCouponDiscount,
  CouponError,
} from "@/lib/coupons";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { code, totalBeforeCoupon } = body;

    // Validaciones básicas
    if (!code || totalBeforeCoupon === undefined || totalBeforeCoupon === null) {
      return NextResponse.json(
        {
          code: "INVALID_INPUT",
          message: "Faltan campos obligatorios (code, totalBeforeCoupon)",
        },
        { status: 400 }
      );
    }

    // Normalizar código
    const normalizedCode = normalizeCouponCode(code);

    if (!normalizedCode) {
      return NextResponse.json(
        {
          code: "INVALID_COUPON_CODE_FORMAT",
          message: "El código del cupón es inválido",
        },
        { status: 400 }
      );
    }

    // Buscar cupón
    const couponData = await prisma.coupon.findUnique({
      where: {
        storeId_code: {
          storeId: session.storeId,
          code: normalizedCode,
        },
      },
    });

    // Convertir a formato de interfaz Coupon
    const coupon = couponData ? {
      id: couponData.id,
      storeId: couponData.storeId,
      code: couponData.code,
      type: couponData.type,
      value: Number(couponData.value),
      minTotal: couponData.minTotal ? Number(couponData.minTotal) : null,
      startsAt: couponData.startsAt,
      endsAt: couponData.endsAt,
      maxUses: couponData.maxUses,
      usesCount: couponData.usesCount,
      active: couponData.active,
    } : null;

    // Hora actual Lima (UTC-5)
    const nowLocalLima = new Date(Date.now() - 5 * 60 * 60 * 1000);

    // Validar y calcular descuento
    try {
      const result = validateAndComputeCouponDiscount(
        coupon,
        totalBeforeCoupon,
        nowLocalLima
      );

      return NextResponse.json({
        valid: true,
        discountAmount: result.discountAmount,
        couponCode: result.snapshotFields.couponCode,
        couponType: result.snapshotFields.couponType,
        couponValue: result.snapshotFields.couponValue,
      });
    } catch (error) {
      const couponError = error as CouponError;
      return NextResponse.json(
        {
          code: couponError.code,
          message: couponError.message,
          details: couponError.details,
        },
        { status: 409 }
      );
    }
  } catch (error) {
    console.error("Error validating coupon:", error);
    return NextResponse.json(
      { error: "Error al validar cupón" },
      { status: 500 }
    );
  }
}
