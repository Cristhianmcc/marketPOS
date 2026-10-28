/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO PH2 — /api/batches
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * GET  ?storeProductId=xxx  → lista lotes activos/inactivos del producto
 * POST                      → registra lote + movimiento PURCHASE + actualiza stock
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey } from '@prisma/client';
import { z } from 'zod';
import { getStoreSessionOrThrow } from '@/lib/session';
import {
  requireStoreActive,
  requireFlag,
  requireRole,
  guardErrorToResponse,
} from '@/lib/guards/requireFlag';
import { prisma } from '@/infra/db/prisma';
import { InventoryMutationError, receiveStockAtomically } from '@/lib/inventory/stockMutations';

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

const WARN_DAYS = 30; // fallback; GET usa expiryAlertDays dinámico de StoreSettings

function batchStatus(expiryDate: Date, warnDays = WARN_DAYS): 'EXPIRED' | 'WARNING' | 'OK' {
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'EXPIRED';
  if (diffDays <= warnDays) return 'WARNING';
  return 'OK';
}

function daysToExpiry(expiryDate: Date): number {
  const now = new Date();
  return Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ══════════════════════════════════════════════════════════════════════════════
// GET — Listar lotes de un storeProduct
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const session = await getStoreSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);

    const { searchParams } = new URL(request.url);
    const storeProductId = searchParams.get('storeProductId');

    if (!storeProductId) {
      return NextResponse.json({ error: 'storeProductId requerido' }, { status: 400 });
    }

    // Verificar que el storeProduct pertenece a esta tienda
    const sp = await prisma.storeProduct.findFirst({
      where: { id: storeProductId, storeId: session.storeId },
    });
    if (!sp) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    const raw = await prisma.productBatch.findMany({
      where: { storeProductId, storeId: session.storeId },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    });

    // Leer umbral dinámico de StoreSettings
    const storeSettings = await prisma.storeSettings.findUnique({
      where: { storeId: session.storeId },
      select: { expiryAlertDays: true },
    });
    const alertDays = storeSettings?.expiryAlertDays ?? 60;

    const batches = raw.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate.toISOString(),
      purchaseDate: b.purchaseDate?.toISOString() ?? null,
      quantityInitial: b.quantityInitial.toNumber(),
      quantityAvailable: b.quantityAvailable.toNumber(),
      unitCost: b.unitCost?.toNumber() ?? null,
      active: b.active,
      notes: b.notes,
      status: batchStatus(b.expiryDate, alertDays),
      daysToExpiry: daysToExpiry(b.expiryDate),
    }));

    const summary = {
      total: batches.length,
      active: batches.filter((b) => b.active).length,
      expiringSoon: batches.filter((b) => b.active && b.status === 'WARNING').length,
      expired: batches.filter((b) => b.active && b.status === 'EXPIRED').length,
    };

    return NextResponse.json({ batches, summary });
  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST — Registrar nuevo lote
// ══════════════════════════════════════════════════════════════════════════════

const CreateBatchSchema = z.object({
  storeProductId: z.string().min(1),
  batchNumber: z.string().min(1).max(100),
  expiryDate: z.string().datetime({ message: 'Formato ISO 8601 requerido' }),
  purchaseDate: z.string().datetime().nullable().optional(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getStoreSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);
    requireRole(session.role, ['OWNER']);

    const body = await request.json();
    const validation = CreateBatchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verificar que el storeProduct pertenece a esta tienda
    const sp = await prisma.storeProduct.findFirst({
      where: { id: data.storeProductId, storeId: session.storeId },
    });
    if (!sp) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    // Verificar unicidad (storeId, storeProductId, batchNumber, expiryDate)
    const existing = await prisma.productBatch.findFirst({
      where: {
        storeId: session.storeId,
        storeProductId: data.storeProductId,
        batchNumber: data.batchNumber,
        expiryDate: new Date(data.expiryDate),
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un lote con ese número y fecha de vencimiento para este producto' },
        { status: 409 }
      );
    }

    // Transacción: crear lote + movimiento + actualizar stock
    const batch = await prisma.$transaction(async (tx) => {
      const newBatch = await tx.productBatch.create({
        data: {
          storeId: session.storeId,
          storeProductId: data.storeProductId,
          batchNumber: data.batchNumber,
          expiryDate: new Date(data.expiryDate),
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
          quantityInitial: data.quantity,
          quantityAvailable: data.quantity,
          unitCost: data.unitCost ?? null,
          notes: data.notes ?? null,
        },
      });

      // Movimiento PURCHASE vinculado al lote
      await tx.movement.create({
        data: {
          storeId: session.storeId,
          storeProductId: data.storeProductId,
          batchId: newBatch.id,
          type: 'PURCHASE',
          quantity: data.quantity,
          unitPrice: data.unitCost ?? null,
          total:
            data.unitCost != null ? data.quantity * data.unitCost : null,
          notes: data.notes ?? `Lote ${data.batchNumber} ingresado`,
          createdById: session.userId,
        },
      });

      // Incremento atómico: no reescribe un stock leído antes de la transacción
      await receiveStockAtomically(tx, {
        storeId: session.storeId,
        storeProductId: data.storeProductId,
        quantity: data.quantity,
      });

      return newBatch;
    });

    return NextResponse.json(
      {
        batch: {
          id: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate.toISOString(),
          quantityInitial: batch.quantityInitial.toNumber(),
          quantityAvailable: batch.quantityAvailable.toNumber(),
          unitCost: batch.unitCost?.toNumber() ?? null,
          status: batchStatus(batch.expiryDate),
          daysToExpiry: daysToExpiry(batch.expiryDate),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof InventoryMutationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return guardErrorToResponse(error);
  }
}
