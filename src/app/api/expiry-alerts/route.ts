/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO PH4 — /api/expiry-alerts
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * GET  ?range=30|60|90|all&status=EXPIRED|WARNING|OK
 *   → lista lotes con estado de vencimiento + resumen
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey } from '@prisma/client';
import { getSessionOrThrow } from '@/lib/session';
import {
  requireStoreActive,
  requireFlag,
  guardErrorToResponse,
} from '@/lib/guards/requireFlag';
import { prisma } from '@/infra/db/prisma';

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysToExpiry(expiryDate: Date): number {
  const now = new Date();
  return Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function batchStatus(days: number): 'VENCIDO' | 'POR_VENCER' | 'OK' {
  if (days <= 0) return 'VENCIDO';
  return 'POR_VENCER'; // se filtra el umbral en el caller
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    if (!session.storeId) {
      return NextResponse.json({ error: 'Sin tienda activa' }, { status: 403 });
    }

    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range') ?? 'all'; // 30|60|90|all
    const statusFilter = searchParams.get('status') ?? 'all'; // EXPIRED|WARNING|OK|all

    // Leer configuración de alertas de la tienda
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId: session.storeId },
      select: { expiryAlertDays: true, showExpiredWarnings: true },
    });

    const alertDays = settings?.expiryAlertDays ?? 60;
    const showExpired = settings?.showExpiredWarnings ?? true;
    const now = new Date();

    // Construir filtro de fecha según rango solicitado
    let expiryDateFilter: Record<string, unknown> = {};
    if (rangeParam !== 'all') {
      const days = parseInt(rangeParam, 10);
      if (!isNaN(days)) {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() + days);
        expiryDateFilter = { lte: cutoff };
      }
    }

    const rawBatches = await prisma.productBatch.findMany({
      where: {
        storeId: session.storeId,
        active: true,
        quantityAvailable: { gt: 0 },
        ...(Object.keys(expiryDateFilter).length > 0
          ? { expiryDate: expiryDateFilter }
          : {}),
      },
      orderBy: { expiryDate: 'asc' },
      include: {
        storeProduct: {
          include: {
            product: {
              select: { name: true, content: true, barcode: true },
            },
          },
        },
      },
    });

    // Calcular estado con umbral dinámico de la tienda
    const batches = rawBatches
      .map((b) => {
        const days = daysToExpiry(b.expiryDate);
        let status: 'VENCIDO' | 'POR_VENCER' | 'OK';
        if (days <= 0) {
          status = 'VENCIDO';
        } else if (days <= alertDays) {
          status = 'POR_VENCER';
        } else {
          status = 'OK';
        }
        return {
          batchId: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate.toISOString(),
          daysToExpiry: days,
          quantityAvailable: b.quantityAvailable.toNumber(),
          unitCost: b.unitCost?.toNumber() ?? null,
          status,
          productName: b.storeProduct.product.name,
          productContent: b.storeProduct.product.content,
          barcode: b.storeProduct.product.barcode,
          storeProductId: b.storeProductId,
        };
      })
      // Aplicar filtro de showExpiredWarnings
      .filter((b) => {
        if (!showExpired && b.status === 'VENCIDO') return false;
        if (statusFilter === 'all') return true;
        const map: Record<string, string> = {
          EXPIRED: 'VENCIDO',
          WARNING: 'POR_VENCER',
          OK: 'OK',
        };
        return b.status === (map[statusFilter] ?? statusFilter);
      });

    // Resumen con umbrales fijos para las cards
    const all = rawBatches.map((b) => ({
      days: daysToExpiry(b.expiryDate),
      qty: b.quantityAvailable.toNumber(),
    }));

    const summary = {
      expired: all.filter((b) => b.days <= 0).length,
      expiring30: all.filter((b) => b.days > 0 && b.days <= 30).length,
      expiring60: all.filter((b) => b.days > 0 && b.days <= 60).length,
      total: all.length,
      alertDays,
    };

    return NextResponse.json({ batches, summary });
  } catch (error) {
    return guardErrorToResponse(error);
  }
}
