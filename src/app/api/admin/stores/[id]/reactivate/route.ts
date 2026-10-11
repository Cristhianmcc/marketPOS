import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { prisma } from '@/infra/db/prisma';
import { logAudit, getRequestMetadata } from '@/lib/auditLog'; // ✅ MÓDULO 15: Auditoría
import { syncFeatureFlagsFromPlan } from '@/lib/featureFlags';
import { transferRecoverableSubscription } from '@/lib/restoredSubscription';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session.isLoggedIn || !session.email) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Check SUPERADMIN
    if (session.role !== 'SUPERADMIN' && !isSuperAdmin(session.email)) {
      return NextResponse.json(
        { error: 'No autorizado. Solo SUPERADMIN puede reactivar tiendas.' },
        { status: 403 }
      );
    }

    const params = await props.params;
    const storeId = params.id;

    // Validate store exists and is ARCHIVED
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, status: true },
    });

    if (!store) {
      return NextResponse.json(
        { error: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    if (store.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'La tienda ya está activa' },
        { status: 400 }
      );
    }

    // Reactivar y, para respaldos antiguos, recuperar dentro de la misma
    // transacción el plan que aún pertenece a la tienda original archivada.
    const { updatedStore, subscriptionRecovery } = await prisma.$transaction(async tx => {
      const updatedStore = await tx.store.update({
        where: { id: storeId },
        data: {
          status: 'ACTIVE',
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          status: true,
        },
      });

      const subscriptionRecovery = await transferRecoverableSubscription(tx, storeId);
      return { updatedStore, subscriptionRecovery };
    });

    let flagsSynced = true;
    if (subscriptionRecovery.transferred) {
      try {
        await syncFeatureFlagsFromPlan(storeId);
      } catch (error) {
        flagsSynced = false;
        console.error('Store reactivated and subscription recovered, but flag sync failed:', error);
      }
    }

    // ✅ MÓDULO 15: Log de auditoría (fire-and-forget)
    const { ip, userAgent } = getRequestMetadata(request);
    logAudit({
      storeId: updatedStore.id,
      userId: session.userId,
      action: 'STORE_REACTIVATED',
      entityType: 'STORE',
      entityId: updatedStore.id,
      severity: 'INFO',
      meta: {
        storeName: updatedStore.name,
        reactivatedBy: session.email,
        previousStatus: store.status,
        recoveredPlan: subscriptionRecovery.transferred
          ? subscriptionRecovery.planCode
          : null,
      },
      ip,
      userAgent,
    }).catch(e => console.error('Audit log failed (non-blocking):', e));

    return NextResponse.json({
      success: true,
      message: subscriptionRecovery.transferred
        ? `Tienda "${updatedStore.name}" reactivada con su plan ${subscriptionRecovery.planCode}`
        : `Tienda "${updatedStore.name}" reactivada exitosamente`,
      store: updatedStore,
      subscriptionRecovered: subscriptionRecovery.transferred,
      flagsSynced,
    });
  } catch (error) {
    console.error('Error reactivating store:', error);
    
    // ✅ MÓDULO 15: Log de fallo (fire-and-forget)
    try {
      const params = await props.params;
      const { ip, userAgent } = getRequestMetadata(request);
      const sessionData = await getSession();
      
      logAudit({
        storeId: params.id,
        userId: sessionData.userId,
        action: 'STORE_REACTIVATE_FAILED',
        entityType: 'STORE',
        entityId: params.id,
        severity: 'ERROR',
        meta: {
          error: error instanceof Error ? error.message : 'Unknown error',
          attemptedBy: sessionData.email,
        },
        ip,
        userAgent,
      }).catch(e => console.error('Audit log failed (non-blocking):', e));
    } catch {}
    
    return NextResponse.json(
      { error: 'Error al reactivar tienda' },
      { status: 500 }
    );
  }
}
