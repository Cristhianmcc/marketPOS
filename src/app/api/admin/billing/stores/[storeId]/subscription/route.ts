// src/app/api/admin/billing/stores/[storeId]/subscription/route.ts
// MÓDULO 16: Actualizar suscripción de una tienda (SUPERADMIN)

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { createAuditLog } from '@/domain/audit-log/audit-log-service';
import { isSuperAdmin } from '@/lib/superadmin';
import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { syncFeatureFlagsFromPlan } from '@/lib/featureFlags';

export async function PATCH(
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
      planCode,
      billingCycle,
      priceAmount,
      setStatus,
      extendDays,
      setTrialDays,
    } = body;

    // Buscar suscripción existente
    let subscription = await prisma.subscription.findUnique({
      where: { storeId },
    });

    if (!subscription) {
      // Crear nueva suscripción
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + (setTrialDays || 30));

      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + (billingCycle === 'YEARLY' ? 12 : 1));

      subscription = await prisma.subscription.create({
        data: {
          storeId,
          planCode: planCode || 'STARTER',
          status: 'TRIAL',
          startAt: now,
          trialEndsAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          priceAmount: priceAmount || 49,
          priceCurrency: 'PEN',
          billingCycle: billingCycle || 'MONTHLY',
        },
      });

      await createAuditLog({
        storeId,
        userId: session.userId,
        action: 'SUBSCRIPTION_CREATED',
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        severity: 'INFO',
        meta: {
          planCode: subscription.planCode,
          billingCycle: subscription.billingCycle,
        },
      });

      // ✅ MÓDULO 16: Sincronizar feature flags según el plan asignado
      try {
        await syncFeatureFlagsFromPlan(storeId);
        console.log(`[Billing] Feature flags synced for new subscription (store: ${storeId}, plan: ${subscription.planCode})`);
      } catch (flagError) {
        console.error('[Billing] Error syncing feature flags on subscription creation:', flagError);
        // No lanzamos error para no bloquear la creación de suscripción
      }

      return NextResponse.json(subscription);
    }

    // Actualizar suscripción existente
    const updateData: any = {};

    if (planCode) updateData.planCode = planCode as PlanCode;
    if (billingCycle) updateData.billingCycle = billingCycle;
    if (priceAmount !== undefined) updateData.priceAmount = priceAmount;

    if (setStatus) {
      updateData.status = setStatus as SubscriptionStatus;
      if (setStatus === 'SUSPENDED') {
        updateData.suspendedAt = new Date();
      } else if (setStatus === 'CANCELLED') {
        updateData.cancelledAt = new Date();
      } else if (setStatus === 'ACTIVE') {
        updateData.suspendedAt = null;
        updateData.cancelledAt = null;
      }
    }

    if (extendDays) {
      const currentEnd = subscription.currentPeriodEnd;
      const newEnd = new Date(currentEnd);
      // Soporte para decimales (horas): 0.042 días = 1 hora
      const millisecondsToAdd = extendDays * 24 * 60 * 60 * 1000;
      newEnd.setTime(newEnd.getTime() + millisecondsToAdd);
      updateData.currentPeriodEnd = newEnd;

      // Si está en gracia, también extender gracia
      if (subscription.graceEndsAt) {
        const newGraceEnd = new Date(subscription.graceEndsAt);
        newGraceEnd.setTime(newGraceEnd.getTime() + millisecondsToAdd);
        updateData.graceEndsAt = newGraceEnd;
      }
    }

    if (setTrialDays !== undefined) {
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + setTrialDays);
      updateData.trialEndsAt = trialEnd;
      updateData.status = 'TRIAL';
    }

    const updated = await prisma.subscription.update({
      where: { storeId },
      data: updateData,
    });

    await createAuditLog({
      storeId,
      userId: session.userId,
      action: 'SUBSCRIPTION_UPDATED',
      entityType: 'SUBSCRIPTION',
      entityId: updated.id,
      severity: 'WARN',
      meta: {
        changes: Object.keys(updateData),
        planCode: updated.planCode,
        status: updated.status,
      },
    });

    // ✅ MÓDULO 16: Sincronizar feature flags si cambió el plan
    if (planCode && planCode !== subscription.planCode) {
      try {
        await syncFeatureFlagsFromPlan(storeId);
        console.log(`[Billing] Feature flags synced after plan change (${subscription.planCode} → ${planCode})`);
      } catch (flagError) {
        console.error('[Billing] Error syncing feature flags on plan change:', flagError);
        // No lanzamos error para no bloquear la actualización
      }
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar suscripción' },
      { status: 500 }
    );
  }
}
