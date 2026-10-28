/**
 * /api/work-orders/[id]/payments
 *
 * GET  → adelantos y devoluciones de la orden
 * POST → cobra un adelanto { amount, method, notes? } en el turno abierto
 */
import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey, PaymentMethod } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getCurrentStoreUser } from '@/lib/session';
import { requireFeature } from '@/lib/featureFlags';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';
import { WorkOrderRuleError } from '@/lib/workOrders/rules';
import { recordAdvance } from '@/lib/workOrders/payments';

const shiftRepo = new PrismaShiftRepository();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentStoreUser();
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const { id } = await params;
    const order = await prisma.workOrder.findFirst({
      where: { id, storeId: session.storeId },
      select: { id: true, total: true, advancePaid: true, payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

    return NextResponse.json({
      data: {
        advancePaid: order.advancePaid.toNumber(),
        balance: Math.round((order.total.toNumber() - order.advancePaid.toNumber()) * 100) / 100,
        payments: order.payments.map((p) => ({
          id: p.id, kind: p.kind, amount: p.amount.toNumber(), method: p.method, notes: p.notes, createdAt: p.createdAt,
        })),
      },
    });
  } catch (error: any) {
    if (error.code === 'FEATURE_DISABLED') return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    console.error('GET /api/work-orders/[id]/payments error:', error);
    return NextResponse.json({ error: 'Error al obtener pagos' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentStoreUser();
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const { id } = await params;
    const body = await request.json();
    const amount = Number(body?.amount);
    const method = body?.method as PaymentMethod;

    const shift = await shiftRepo.getCurrentShift(session.storeId, session.userId);
    if (!shift) {
      return NextResponse.json({ error: 'No tienes un turno abierto. Abre tu turno para cobrar el adelanto.' }, { status: 400 });
    }

    const result = await prisma.$transaction((tx) => recordAdvance(tx, {
      storeId: session.storeId,
      workOrderId: id,
      shiftId: shift.id,
      userId: session.userId,
      amount,
      method,
      notes: typeof body?.notes === 'string' ? body.notes : null,
    }));

    return NextResponse.json({
      data: { paymentId: result.payment.id, advancePaid: result.advancePaid, balance: result.balance },
    }, { status: 201 });
  } catch (error: any) {
    if (error instanceof WorkOrderRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error.code === 'FEATURE_DISABLED') return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    console.error('POST /api/work-orders/[id]/payments error:', error);
    return NextResponse.json({ error: 'Error al registrar el adelanto' }, { status: 500 });
  }
}
