// app/api/admin/operational-limits/route.ts
// ✅ MÓDULO 15 - FASE 3: API para gestionar límites operativos
// GET: Obtener límites de una tienda
// PUT: Actualizar límites de una tienda

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { 
  getOperationalLimits, 
  setOperationalLimits,
  type OperationalLimits 
} from '@/lib/operationalLimits';
import { logAudit, getRequestMetadata } from '@/lib/auditLog';

/**
 * GET /api/admin/operational-limits?storeId=xxx
 * Obtener límites operativos de una tienda
 * OWNER: solo sus límites
 * SUPERADMIN: cualquier tienda
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session?.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedStoreId = searchParams.get('storeId');
    const isSuper = isSuperAdmin(session.email);

    // Determinar el storeId a usar
    let targetStoreId: string;
    
    if (isSuper) {
      targetStoreId = requestedStoreId || session.storeId;
    } else {
      if (requestedStoreId && requestedStoreId !== session.storeId) {
        return NextResponse.json(
          { code: 'FORBIDDEN', message: 'No autorizado para ver otra tienda' },
          { status: 403 }
        );
      }
      targetStoreId = session.storeId;
    }

    if (!targetStoreId) {
      return NextResponse.json(
        { code: 'INVALID_STORE', message: 'storeId no disponible' },
        { status: 400 }
      );
    }

    const limits = await getOperationalLimits(targetStoreId);

    return NextResponse.json({ limits });
  } catch (error) {
    console.error('Error getting operational limits:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener límites' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/operational-limits
 * Actualizar límites operativos de una tienda
 * OWNER: solo sus límites
 * SUPERADMIN: cualquier tienda
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    let { storeId, limits } = body;

    const isSuper = isSuperAdmin(session.email);

    // Si no hay storeId en el body, usar el de la sesión
    if (!storeId) {
      storeId = session.storeId;
    }

    // Validaciones
    if (!storeId) {
      return NextResponse.json(
        { code: 'INVALID_STORE', message: 'storeId no disponible en la sesión' },
        { status: 400 }
      );
    }

    if (!limits || typeof limits !== 'object') {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'limits es requerido y debe ser un objeto' },
        { status: 400 }
      );
    }

    // OWNER solo puede actualizar su tienda
    if (!isSuper) {
      if (storeId !== session.storeId) {
        return NextResponse.json(
          { code: 'FORBIDDEN', message: 'No autorizado' },
          { status: 403 }
        );
      }
    }

    // Obtener valores anteriores para auditoría
    const previousLimits = await getOperationalLimits(storeId);

    // Actualizar límites
    const updatedLimits = await setOperationalLimits(storeId, limits);

    // ✅ AUDITORÍA: Log de cambio de límites
    const { ip, userAgent } = getRequestMetadata(request);
    logAudit({
      storeId,
      userId: session.userId,
      action: 'LIMITS_UPDATED',
      entityType: 'SYSTEM',
      entityId: storeId,
      severity: 'WARN',
      meta: {
        previousValues: previousLimits,
        newValues: limits,
        updatedBy: session.email,
      },
      ip,
      userAgent,
    }).catch(e => console.error('Audit log failed (non-blocking):', e));

    return NextResponse.json({ 
      limits: {
        maxDiscountPercent: updatedLimits.maxDiscountPercent ? Number(updatedLimits.maxDiscountPercent) : null,
        maxManualDiscountAmount: updatedLimits.maxManualDiscountAmount ? Number(updatedLimits.maxManualDiscountAmount) : null,
        maxSaleTotal: updatedLimits.maxSaleTotal ? Number(updatedLimits.maxSaleTotal) : null,
        maxItemsPerSale: updatedLimits.maxItemsPerSale,
        maxReceivableBalance: updatedLimits.maxReceivableBalance ? Number(updatedLimits.maxReceivableBalance) : null,
      }
    });
  } catch (error) {
    console.error('Error updating operational limits:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al actualizar límites' },
      { status: 500 }
    );
  }
}
