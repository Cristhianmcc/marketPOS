// src/app/api/coupons/route.ts
// CRUD de cupones (GET lista, POST crear)

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/infra/db/prisma";
import { normalizeCouponCode } from "@/lib/coupons";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Solo OWNER puede gestionar cupones
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const coupons = await prisma.coupon.findMany({
      where: { storeId: session.storeId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(coupons);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return NextResponse.json(
      { error: "Error al obtener cupones" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Solo OWNER puede crear cupones
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { code, type, value, minTotal, startsAt, endsAt, maxUses } = body;

    // Validaciones básicas
    if (!code || !type || value === undefined || value === null) {
      return NextResponse.json(
        {
          code: "INVALID_INPUT",
          message: "Faltan campos obligatorios (code, type, value)",
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

    // Validaciones específicas por tipo
    if (type === "PERCENT") {
      if (value <= 0 || value > 100) {
        return NextResponse.json(
          {
            code: "INVALID_VALUE",
            message: "El porcentaje debe estar entre 0 y 100",
          },
          { status: 400 }
        );
      }
    } else if (type === "AMOUNT") {
      if (value <= 0) {
        return NextResponse.json(
          {
            code: "INVALID_VALUE",
            message: "El monto debe ser mayor a 0",
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        {
          code: "INVALID_TYPE",
          message: "Tipo de cupón inválido (PERCENT o AMOUNT)",
        },
        { status: 400 }
      );
    }

    // Validar fechas
    if (startsAt && endsAt) {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (end <= start) {
        return NextResponse.json(
          {
            code: "INVALID_DATES",
            message: "La fecha de fin debe ser posterior a la de inicio",
          },
          { status: 400 }
        );
      }
    }

    // Validar maxUses
    if (maxUses !== undefined && maxUses !== null && maxUses < 1) {
      return NextResponse.json(
        {
          code: "INVALID_MAX_USES",
          message: "El máximo de usos debe ser al menos 1 o null",
        },
        { status: 400 }
      );
    }

    // Crear cupón
    const coupon = await prisma.coupon.create({
      data: {
        storeId: session.storeId,
        code: normalizedCode,
        type,
        value,
        minTotal: minTotal || null,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        maxUses: maxUses || null,
        active: true,
      },
    });

    return NextResponse.json(coupon, { status: 201 });
  } catch (error: any) {
    console.error("Error creating coupon:", error);

    // Error de código único
    if (error.code === "P2002") {
      return NextResponse.json(
        {
          code: "COUPON_CODE_ALREADY_EXISTS",
          message: "Ya existe un cupón con ese código",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Error al crear cupón" },
      { status: 500 }
    );
  }
}
