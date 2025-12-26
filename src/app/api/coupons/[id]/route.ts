// src/app/api/coupons/[id]/route.ts
// PATCH (toggle active, editar), DELETE cupón específico

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/infra/db/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Solo OWNER puede editar cupones
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { active } = body;

    const coupon = await prisma.coupon.update({
      where: { id, storeId: session.storeId },
      data: { active },
    });

    return NextResponse.json(coupon);
  } catch (error: any) {
    console.error("Error updating coupon:", error);

    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Cupón no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Error al actualizar cupón" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Solo OWNER puede eliminar cupones
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { id } = await params;

  try {
    await prisma.coupon.delete({
      where: { id, storeId: session.storeId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting coupon:", error);

    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Cupón no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Error al eliminar cupón" },
      { status: 500 }
    );
  }
}
