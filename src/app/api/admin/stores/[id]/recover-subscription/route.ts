import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { prisma } from '@/infra/db/prisma';
import { syncFeatureFlagsFromPlan } from '@/lib/featureFlags';
import { transferRecoverableSubscription } from '@/lib/restoredSubscription';
import { getRequestMetadata, logAudit } from '@/lib/auditLog';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.role !== 'SUPERADMIN' && !isSuperAdmin(session.email)) {
      return NextResponse.json(
        { error: 'No autorizado. Solo SUPERADMIN puede recuperar planes.' },
        { status: 403 }
      );
    }

    const { id: storeId } = await props.params;
    const result = await prisma.$transaction(tx =>
      transferRecoverableSubscription(tx, storeId)
    );

    if (!result.transferred) {
      const responses = {
        STORE_NOT_FOUND: { status: 404, error: 'Tienda no encontrada' },
        ALREADY_ASSIGNED: { status: 409, error: 'La tienda ya tiene un plan asignado' },
        NO_UNIQUE_SOURCE: {
          status: 409,
          error: 'No se encontró una única tienda archivada correspondiente con un plan recuperable',
        },
      } as const;
      const response = responses[result.reason];
      return NextResponse.json({ error: response.error }, { status: response.status });
    }

    let flagsSynced = true;
    try {
      await syncFeatureFlagsFromPlan(storeId);
    } catch (error) {
      flagsSynced = false;
      console.error('Subscription recovered but feature flag sync failed:', error);
    }

    const { ip, userAgent } = getRequestMetadata(request);
    logAudit({
      storeId,
      userId: session.userId,
      action: 'SUBSCRIPTION_RECOVERED_FROM_ARCHIVED_STORE',
      entityType: 'SUBSCRIPTION',
      entityId: result.subscriptionId,
      severity: 'WARN',
      meta: {
        planCode: result.planCode,
        sourceStoreId: result.sourceStoreId,
        sourceStoreName: result.sourceStoreName,
        recoveredBy: session.email,
      },
      ip,
      userAgent,
    }).catch(error => console.error('Audit log failed (non-blocking):', error));

    return NextResponse.json({
      success: true,
      message: flagsSynced
        ? `Plan ${result.planCode} recuperado para la tienda restaurada`
        : `Plan ${result.planCode} recuperado. Los permisos se sincronizarán al volver a asignar el plan.`,
      planCode: result.planCode,
      flagsSynced,
    });
  } catch (error) {
    console.error('Error recovering restored store subscription:', error);
    return NextResponse.json(
      { error: 'No se pudo recuperar el plan de la tienda restaurada' },
      { status: 500 }
    );
  }
}
