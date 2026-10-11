import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { prisma } from '@/infra/db/prisma';
import { logAudit, getRequestMetadata } from '@/lib/auditLog'; // ✅ MÓDULO 15: Auditoría

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
        { error: 'No autorizado. Solo SUPERADMIN puede archivar tiendas.' },
        { status: 403 }
      );
    }

    const params = await props.params;
    const storeId = params.id;

    // Validate store exists and is ACTIVE
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

    if (store.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: 'La tienda ya está archivada' },
        { status: 400 }
      );
    }

    // Archive store
    const updatedStore = await prisma.store.update({
      where: { id: storeId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        status: true,
        archivedAt: true,
      },
    });

    // ✅ MÓDULO 15: Log de auditoría (fire-and-forget)
    const { ip, userAgent } = getRequestMetadata(request);
    logAudit({
      storeId: updatedStore.id,
      userId: session.userId,
      action: 'STORE_ARCHIVED',
      entityType: 'STORE',
      entityId: updatedStore.id,
      severity: 'WARN',
      meta: {
        storeName: updatedStore.name,
        archivedBy: session.email,
        previousStatus: store.status,
      },
      ip,
      userAgent,
    }).catch(e => console.error('Audit log failed (non-blocking):', e));

    return NextResponse.json({
      success: true,
      message: `Tienda "${updatedStore.name}" archivada exitosamente`,
      store: updatedStore,
    });
  } catch (error) {
    console.error('Error archiving store:', error);
    
    // ✅ MÓDULO 15: Log de fallo (fire-and-forget)
    try {
      const params = await props.params;
      const { ip, userAgent } = getRequestMetadata(request);
      const sessionData = await getSession();
      
      logAudit({
        storeId: params.id,
        userId: sessionData.userId,
        action: 'STORE_ARCHIVE_FAILED',
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
      { error: 'Error al archivar tienda' },
      { status: 500 }
    );
  }
}
