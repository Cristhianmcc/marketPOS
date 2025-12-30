// src/app/api/admin/quick-sell/order/route.ts
// ✅ MÓDULO 17.2: Admin API - Actualizar orden de productos rápidos
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

// ✅ POST - Actualizar orden de productos quick sell
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { order } = await req.json();

    if (!Array.isArray(order)) {
      return NextResponse.json(
        { error: 'Datos inválidos' },
        { status: 400 }
      );
    }

    // ✅ Actualizar orden de cada producto
    await Promise.all(
      order.map(({ id, order: newOrder }) =>
        prisma.productMaster.update({
          where: { id },
          data: { quickSellOrder: newOrder },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Quick Sell Order API] Error:', error);
    return NextResponse.json(
      { error: 'Error al actualizar orden' },
      { status: 500 }
    );
  }
}
