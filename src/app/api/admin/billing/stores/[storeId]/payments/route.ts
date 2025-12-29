// src/app/api/admin/billing/stores/[storeId]/payments/route.ts
// MÓDULO 16: Registrar pago manual y reactivar suscripción (SUPERADMIN)

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { createAuditLog } from '@/domain/audit-log/audit-log-service';
import { isSuperAdmin } from '@/lib/superadmin';
import { syncFeatureFlagsFromPlan } from '@/lib/featureFlags';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const session = await getSessionOrThrow();

    // Solo SUPERADMIN puede acceder
    if (!isSuperAdmin(session.email)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const { storeId } = await params;
    const body = await request.json();

    const {
      amount,
      currency = 'PEN',
      method,
      reference,
      paidAt,
    } = body;

    // Validar campos requeridos
    if (!amount || !method) {
      return NextResponse.json({ error: 'Faltan campos requeridos: amount, method' }, { status: 400 });
    }

    // Buscar suscripción
    const subscription = await prisma.subscription.findUnique({
      where: { storeId },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'La tienda no tiene suscripción' }, { status: 404 });
    }

    // Calcular nuevas fechas de periodo
    const now = new Date();
    const periodEnd = new Date(now);
    const monthsToAdd = subscription.billingCycle === 'YEARLY' ? 12 : 1;
    periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd);

    // Crear pago
    const payment = await prisma.payment.create({
      data: {
        storeId,
        subscriptionId: subscription.id,
        amount,
        currency,
        paidAt: paidAt ? new Date(paidAt) : now,
        method,
        reference: reference || null,
        status: 'CONFIRMED',
        createdById: session.userId,
      },
    });

    // Reactivar suscripción
    const updatedSubscription = await prisma.subscription.update({
      where: { storeId },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null,
        suspendedAt: null,
        cancelledAt: null,
      },
    });

    // Auditoría
    await createAuditLog({
      storeId,
      userId: session.userId,
      action: 'PAYMENT_REGISTERED',
      entityType: 'PAYMENT',
      entityId: payment.id,
      severity: 'INFO',
      meta: {
        amount,
        currency,
        method,
        reference,
        subscriptionReactivated: true,
      },
    });

    await createAuditLog({
      storeId,
      userId: session.userId,
      action: 'SUBSCRIPTION_REACTIVATED',
      entityType: 'SUBSCRIPTION',
      entityId: subscription.id,
      severity: 'INFO',
      meta: {
        newPeriodEnd: periodEnd.toISOString(),
      },
    });

    // ✅ MÓDULO 16: Sincronizar feature flags al reactivar (por si cambió de plan)
    try {
      await syncFeatureFlagsFromPlan(storeId);
      console.log(`[Billing] Feature flags synced after payment/reactivation (store: ${storeId})`);
    } catch (flagError) {
      console.error('[Billing] Error syncing feature flags on reactivation:', flagError);
      // No lanzamos error para no bloquear el registro de pago
    }

    return NextResponse.json({
      payment,
      subscription: updatedSubscription,
    });
  } catch (error: any) {
    console.error('Error registering payment:', error);
    return NextResponse.json(
      { error: error.message || 'Error al registrar pago' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const session = await getSessionOrThrow();

    // Solo SUPERADMIN puede acceder
    if (!isSuperAdmin(session.email)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const { storeId } = await params;

    const payments = await prisma.payment.findMany({
      where: { storeId },
      orderBy: { paidAt: 'desc' },
    });

    return NextResponse.json(payments);
  } catch (error: any) {
    console.error('Error fetching payments:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener pagos' },
      { status: 500 }
    );
  }
}
