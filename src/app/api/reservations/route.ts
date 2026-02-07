/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V0 — /api/reservations (EJEMPLO AISLADO)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint para reservaciones (HOSTAL/HOTEL).
 * Requiere flag ENABLE_RESERVATIONS habilitado.
 * 
 * Flujo: Reserva → Check-in → Hospedado → Check-out
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey } from '@prisma/client';
import { getSessionOrThrow } from '@/lib/session';
import { 
  requireStoreActive, 
  requireFlag, 
  requireRole,
  guardErrorToResponse 
} from '@/lib/guards/requireFlag';

// ══════════════════════════════════════════════════════════════════════════════
// GET - Listar reservaciones
// ══════════════════════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    
    // ✅ GUARD: Flag requerido
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_RESERVATIONS);

    // TODO: Implementar cuando se desarrolle el módulo
    const reservations = [
      { 
        id: 'res-1', 
        guestName: 'María García',
        room: '101',
        checkIn: '2026-02-05',
        checkOut: '2026-02-07',
        status: 'CONFIRMED',
      },
    ];

    return NextResponse.json({ reservations });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST - Crear reservación
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_RESERVATIONS);
    requireRole(session.role, ['OWNER', 'CASHIER']);

    const body = await request.json();
    
    // TODO: Validar disponibilidad y crear reservación
    
    return NextResponse.json({ 
      message: 'Reservación creada (placeholder)',
      data: body,
    }, { status: 201 });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
