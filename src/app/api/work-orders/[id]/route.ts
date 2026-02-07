/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F4 — /api/work-orders/[id] (Obtener orden individual)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { requireFeature } from '@/lib/featureFlags';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const { id } = await params;

    const workOrder = await prisma.workOrder.findFirst({
      where: { id, storeId: session.storeId },
      include: {
        customer: { select: { id: true, name: true, phone: true, dni: true } },
        items: {
          include: {
            storeProduct: {
              include: { product: { select: { name: true, content: true, category: true } } },
            },
            service: { select: { id: true, name: true, price: true } },
            unitUsed: { select: { id: true, code: true, symbol: true, name: true } },
          },
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            total: true,
            paymentMethod: true,
            createdAt: true,
          },
        },
      },
    });

    if (!workOrder) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ data: workOrder });

  } catch (error: any) {
    console.error('GET /api/work-orders/[id] error:', error);
    if (error.code === 'FEATURE_DISABLED') {
      return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
