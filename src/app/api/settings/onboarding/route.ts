// src/app/api/settings/onboarding/route.ts
// ✅ MÓDULO 16.2: Onboarding - Get/Update estado del onboarding

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { createAuditLog } from '@/domain/audit-log/audit-log-service';

/**
 * GET /api/settings/onboarding
 * Retorna el estado actual del onboarding de la tienda
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    const settings = await prisma.storeSettings.findUnique({
      where: { storeId: session.storeId },
      select: {
        onboardingStep: true,
        onboardingCompletedAt: true,
        onboardingDismissedAt: true,
        defaultPaymentMethod: true,
        ticketHeaderLine1: true,
        ticketHeaderLine2: true,
      },
    });

    if (!settings) {
      // Si no existe settings, crear con valores por defecto
      const newSettings = await prisma.storeSettings.create({
        data: {
          storeId: session.storeId,
          taxRate: 0,
          onboardingStep: 0,
        },
      });

      return NextResponse.json({
        step: 0,
        completedAt: null,
        dismissedAt: null,
        defaultPaymentMethod: 'CASH',
        ticketHeaderLine1: null,
        ticketHeaderLine2: null,
      });
    }

    return NextResponse.json({
      step: settings.onboardingStep,
      completedAt: settings.onboardingCompletedAt,
      dismissedAt: settings.onboardingDismissedAt,
      defaultPaymentMethod: settings.defaultPaymentMethod,
      ticketHeaderLine1: settings.ticketHeaderLine1,
      ticketHeaderLine2: settings.ticketHeaderLine2,
    });
  } catch (error: any) {
    console.error('Error getting onboarding status:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener estado de onboarding' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/onboarding
 * Actualiza el paso actual del onboarding
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    // Solo OWNER puede completar onboarding
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede gestionar el onboarding' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      step,
      completed,
      dismissed,
      defaultPaymentMethod,
      ticketHeaderLine1,
      ticketHeaderLine2,
    } = body;

    const updateData: any = {};

    if (step !== undefined) {
      updateData.onboardingStep = step;
    }

    if (completed !== undefined) {
      updateData.onboardingCompletedAt = completed ? new Date() : null;
    }

    if (dismissed !== undefined) {
      updateData.onboardingDismissedAt = dismissed ? new Date() : null;
    }

    if (defaultPaymentMethod) {
      updateData.defaultPaymentMethod = defaultPaymentMethod;
    }

    if (ticketHeaderLine1 !== undefined) {
      updateData.ticketHeaderLine1 = ticketHeaderLine1;
    }

    if (ticketHeaderLine2 !== undefined) {
      updateData.ticketHeaderLine2 = ticketHeaderLine2;
    }

    const updated = await prisma.storeSettings.update({
      where: { storeId: session.storeId },
      data: updateData,
    });

    // Auditoría
    await createAuditLog({
      storeId: session.storeId,
      userId: session.userId,
      action: completed ? 'ONBOARDING_COMPLETED' : 'ONBOARDING_STEP_UPDATED',
      entityType: 'STORE',
      entityId: session.storeId,
      severity: 'INFO',
      meta: {
        step: updated.onboardingStep,
        completed: !!updated.onboardingCompletedAt,
        dismissed: !!updated.onboardingDismissedAt,
      },
    });

    return NextResponse.json({
      step: updated.onboardingStep,
      completedAt: updated.onboardingCompletedAt,
      dismissedAt: updated.onboardingDismissedAt,
      defaultPaymentMethod: updated.defaultPaymentMethod,
    });
  } catch (error: any) {
    console.error('Error updating onboarding:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar onboarding' },
      { status: 500 }
    );
  }
}
