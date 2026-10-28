/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V0 — GET /api/flags
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint para obtener todos los feature flags de la tienda actual.
 * Usado por el hook useFlags() en el frontend.
 */

import { NextResponse } from 'next/server';
import { getStoreSessionOrThrow } from '@/lib/session';
import { ensureProfileFlags, getAllFeatureFlags } from '@/lib/featureFlags';
import { requireStoreActive, guardErrorToResponse } from '@/lib/guards/requireFlag';

export async function GET() {
  try {
    // 1. Verificar autenticación
    const session = await getStoreSessionOrThrow();

    // 2. Verificar que la tienda esté activa
    if (!session.storeId) {
      return NextResponse.json({ code: 'NO_STORE', message: 'Sin tienda asignada' }, { status: 403 });
    }
    await requireStoreActive(session.storeId);

    // 3. Completar módulos del rubro que falten y obtener todos los flags
    await ensureProfileFlags(session.storeId);
    const flags = await getAllFeatureFlags(session.storeId);

    // 4. Retornar flags
    return NextResponse.json({ 
      flags,
      storeId: session.storeId,
      isDesktop: process.env.DESKTOP_MODE === 'true',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
