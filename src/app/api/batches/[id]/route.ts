/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO PH2 — /api/batches/[id]
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * PATCH ?action=deactivate → desactivar lote (active = false) y revertir stock
 * PATCH ?action=edit       → editar campos del lote (expiryDate, batchNumber, unitCost, notes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey } from '@prisma/client';
import { getStoreSessionOrThrow } from '@/lib/session';
import {
  requireStoreActive,
  requireFlag,
  requireRole,
  guardErrorToResponse,
} from '@/lib/guards/requireFlag';
import { prisma } from '@/infra/db/prisma';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getStoreSessionOrThrow();

    if (!session.storeId) {
      return NextResponse.json({ error: 'Sin tienda activa' }, { status: 403 });
    }

    const storeId = session.storeId;

    await requireStoreActive(storeId);
    await requireFlag(storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);
    requireRole(session.role, ['OWNER']);

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') ?? 'deactivate';

    const batch = await prisma.productBatch.findFirst({
      where: { id, storeId },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 });
    }

    // ── EDITAR LOTE ──────────────────────────────────────────────────────────
    if (action === 'edit') {
      const body = await request.json();
      const { expiryDate, batchNumber, unitCost, notes } = body;

      if (!expiryDate) {
        return NextResponse.json({ error: 'expiryDate requerido' }, { status: 400 });
      }

      const updated = await prisma.productBatch.update({
        where: { id },
        data: {
          ...(expiryDate && { expiryDate: new Date(expiryDate) }),
          ...(batchNumber !== undefined && { batchNumber }),
          ...(unitCost !== undefined && { unitCost: unitCost ?? null }),
          ...(notes !== undefined && { notes: notes ?? null }),
        },
      });

      return NextResponse.json({
        message: 'Lote actualizado correctamente',
        batch: {
          id: updated.id,
          batchNumber: updated.batchNumber,
          expiryDate: updated.expiryDate.toISOString(),
          unitCost: updated.unitCost?.toNumber() ?? null,
          notes: updated.notes,
        },
      });
    }

    // ── DESACTIVAR LOTE ──────────────────────────────────────────────────────
    if (!batch.active) {
      return NextResponse.json({ error: 'El lote ya está inactivo' }, { status: 409 });
    }

    const qtyToRevert = batch.quantityAvailable.toNumber();

    await prisma.$transaction(async (tx) => {
      await tx.productBatch.update({
        where: { id },
        data: { active: false, quantityAvailable: 0 },
      });

      if (qtyToRevert > 0) {
        await tx.movement.create({
          data: {
            storeId: storeId,
            storeProductId: batch.storeProductId,
            batchId: id,
            type: 'ADJUSTMENT',
            quantity: -qtyToRevert,
            unitPrice: null,
            total: null,
            notes: `Lote ${batch.batchNumber} dado de baja`,
            createdById: session.userId,
          },
        });

        const sp = await tx.storeProduct.findUnique({
          where: { id: batch.storeProductId },
        });
        const currentStock = sp?.stock?.toNumber() ?? 0;
        const newStock = Math.max(0, currentStock - qtyToRevert);
        await tx.storeProduct.update({
          where: { id: batch.storeProductId },
          data: { stock: newStock },
        });
      }
    });

    return NextResponse.json({ message: 'Lote desactivado correctamente' });
  } catch (error) {
    return guardErrorToResponse(error);
  }
}
