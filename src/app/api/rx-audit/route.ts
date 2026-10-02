/**
 * MÓDULO PH6 — Auditoría de venta de productos Rx
 *
 * POST /api/rx-audit
 * Registra un log RX_PRODUCT_SOLD por cada producto que requiere receta vendido.
 * Fire-and-forget: el cliente llama tras checkout exitoso, nunca bloquea la venta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { logAudit } from '@/lib/auditLog';
import { guardErrorToResponse } from '@/lib/guards/requireFlag';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    const body = await req.json();
    const { saleId, productId, observation, patientName, prescriptionNumber } = body;

    if (!saleId || !productId) {
      return NextResponse.json({ error: 'saleId y productId son requeridos' }, { status: 400 });
    }

    // ✅ Fire-and-forget: no lanza si falla
    await logAudit({
      storeId: session.storeId,
      userId: session.userId,
      action: 'RX_PRODUCT_SOLD',
      entityType: 'SALE',
      entityId: saleId,
      severity: 'WARN',
      meta: {
        saleId,
        productId,
        cashierId: session.userId,
        observation: observation || null,
        patientName: patientName || null,
        prescriptionNumber: prescriptionNumber || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return guardErrorToResponse(error);
  }
}
