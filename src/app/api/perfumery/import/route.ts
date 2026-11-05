/**
 * POST /api/perfumery/import (OWNER)
 * { fragrances?, presentations?, extras?, packs?, csv?, useDefaultPresentations?,
 *   initialStockMl?, initialContainerStock?, updateExisting? }
 * useDefaultPresentations también carga los extras y packs de referencia si el
 * archivo no trae los suyos.
 *
 * Carga el catálogo en la sede actual: esencia (producto en ml), fragancia,
 * presentaciones y envases. Nunca cambia el stock de lo que ya existe; el
 * stock se mueve con compras y ajustes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import {
  DEFAULT_EXTRAS,
  DEFAULT_PACKS,
  DEFAULT_PRESENTATIONS,
  importPerfumeryCatalog,
  parseFragranceCsv,
  validateCatalog,
} from '@/lib/perfumery/catalog';
import { logAudit } from '@/lib/auditLog';

const optionalStock = (value: unknown, max: number): number | null | 'invalid' => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : 'invalid';
};

export async function POST(request: NextRequest) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const initialStockMl = optionalStock(body.initialStockMl, 1_000_000);
  const initialContainerStock = optionalStock(body.initialContainerStock, 100_000);
  if (initialStockMl === 'invalid' || initialContainerStock === 'invalid') {
    return NextResponse.json({ error: 'Stock inicial inválido' }, { status: 400 });
  }

  const fragrances = typeof body.csv === 'string' ? parseFragranceCsv(body.csv) : body.fragrances;
  const presentations = Array.isArray(body.presentations) && body.presentations.length
    ? body.presentations
    : body.useDefaultPresentations ? DEFAULT_PRESENTATIONS : [];

  const pick = (list: unknown, defaults: unknown[]) =>
    Array.isArray(list) && list.length ? list : body.useDefaultPresentations ? defaults : [];
  const catalog = validateCatalog({
    fragrances: fragrances ?? [],
    presentations,
    extras: pick(body.extras, DEFAULT_EXTRAS),
    packs: pick(body.packs, DEFAULT_PACKS),
  });
  if (catalog.errors.length) {
    return NextResponse.json({ error: 'El catálogo tiene errores', details: catalog.errors.slice(0, 50) }, { status: 400 });
  }

  const result = await prisma.$transaction(
    (tx) => importPerfumeryCatalog(tx, catalog, {
      storeId: session.storeId,
      initialStockMl,
      initialContainerStock,
      updateExisting: Boolean(body.updateExisting),
    }),
    { timeout: 120_000, maxWait: 10_000 }
  );

  logAudit({
    storeId: session.storeId,
    userId: session.userId,
    action: 'PERFUMERY_CATALOG_IMPORTED',
    entityType: 'PRODUCT',
    entityId: session.storeId,
    severity: 'INFO',
    meta: { ...result },
  }).catch(() => {});

  return NextResponse.json({ result });
}
