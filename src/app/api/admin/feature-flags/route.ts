// app/api/admin/feature-flags/route.ts
// ✅ MÓDULO 15 - FASE 2: Feature Flags API
// GET: Listar flags de una tienda
// PUT: Actualizar un flag

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { getAllFeatureFlags, setFeatureFlag, FeatureDisabledError } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';
import { logAudit, getRequestMetadata } from '@/lib/auditLog';

/**
 * GET /api/admin/feature-flags?storeId=xxx
 * Obtener todas las flags de una tienda
 * OWNER puede ver sus flags, SUPERADMIN puede ver cualquier tienda
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    console.log('[FeatureFlags GET] Session:', {
      userId: session?.userId,
      storeId: session?.storeId,
      email: session?.email,
      role: session?.role,
    });
    
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
      // SUPERADMIN puede ver cualquier tienda si pasa storeId, o su propia tienda por defecto
      targetStoreId = requestedStoreId || session.storeId;
    } else {
      // OWNER: si pasa storeId, debe ser el suyo; si no pasa, usar el suyo
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

    const flags = await getAllFeatureFlags(targetStoreId);

    return NextResponse.json({ flags });
  } catch (error) {
    console.error('Error getting feature flags:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener flags' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/feature-flags
 * Actualizar un flag de una tienda
 * OWNER puede actualizar sus flags, SUPERADMIN puede actualizar cualquier tienda
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
    let { storeId, key, enabled } = body;

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

    if (!key || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'key y enabled son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el key es válido
    if (!Object.values(FeatureFlagKey).includes(key as FeatureFlagKey)) {
      return NextResponse.json(
        { code: 'INVALID_KEY', message: 'Flag key inválido' },
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

    // Actualizar flag
    const flag = await setFeatureFlag(storeId, key as FeatureFlagKey, enabled);

    // ✅ AUDITORÍA: Log de cambio de flag
    const { ip, userAgent } = getRequestMetadata(request);
    logAudit({
      storeId,
      userId: session.userId,
      action: enabled ? 'FEATURE_ENABLED' : 'FEATURE_DISABLED',
      entityType: 'STORE',
      entityId: storeId,
      severity: 'INFO',
      meta: {
        flagKey: key,
        enabled,
        changedBy: session.email,
      },
      ip,
      userAgent,
    }).catch(e => console.error('Audit log failed (non-blocking):', e));

    return NextResponse.json({ flag });
  } catch (error) {
    console.error('Error updating feature flag:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al actualizar flag' },
      { status: 500 }
    );
  }
}
