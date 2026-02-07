/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V0 — /api/batches (EJEMPLO AISLADO)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint para lotes y vencimientos (BOTICA/FARMACIA).
 * Requiere flag ENABLE_BATCH_EXPIRY habilitado.
 * 
 * Propósito: Trazabilidad de lotes, alertas de vencimiento, FIFO automático.
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
// GET - Listar lotes
// ══════════════════════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    
    // ✅ GUARD: Flag requerido
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);

    // TODO: Implementar cuando se desarrolle el módulo
    const batches = [
      { 
        id: 'batch-1', 
        productName: 'Paracetamol 500mg',
        lotNumber: 'LOT-2026-001',
        quantity: 100,
        expiryDate: '2027-06-15',
        daysToExpiry: 495,
        status: 'OK',
      },
      { 
        id: 'batch-2', 
        productName: 'Ibuprofeno 400mg',
        lotNumber: 'LOT-2025-089',
        quantity: 25,
        expiryDate: '2026-03-01',
        daysToExpiry: 24,
        status: 'WARNING', // Próximo a vencer
      },
    ];

    return NextResponse.json({ 
      batches,
      summary: {
        total: batches.length,
        expiringSoon: batches.filter(b => b.status === 'WARNING').length,
        expired: 0,
      }
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST - Registrar lote
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);
    requireRole(session.role, ['OWNER']);

    const body = await request.json();
    
    // TODO: Validar y registrar lote con fecha de vencimiento
    
    return NextResponse.json({ 
      message: 'Lote registrado (placeholder)',
      data: body,
    }, { status: 201 });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
