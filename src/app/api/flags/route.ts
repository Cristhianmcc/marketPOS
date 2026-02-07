/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V0 — GET /api/flags
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint para obtener todos los feature flags de la tienda actual.
 * Usado por el hook useFlags() en el frontend.
 */

import { NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { getAllFeatureFlags } from '@/lib/featureFlags';
import { requireStoreActive, guardErrorToResponse } from '@/lib/guards/requireFlag';

export async function GET() {
  try {
    // 1. Verificar autenticación
    const session = await getSessionOrThrow();

    // 2. Verificar que la tienda esté activa
    await requireStoreActive(session.storeId);

    // 3. Obtener todos los flags
    const flags = await getAllFeatureFlags(session.storeId);

    // 4. Retornar flags
    return NextResponse.json({ 
      flags,
      storeId: session.storeId,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
