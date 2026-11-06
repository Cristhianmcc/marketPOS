/**
 * Importación del catálogo de perfumería (JSON, CSV o ZIP con fotos).
 * Valida, carga en una transacción y deja auditoría. La usan
 * POST /api/perfumery/import y POST /api/perfumery/import/zip.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { logAudit } from '@/lib/auditLog';
import {
  DEFAULT_EXTRAS,
  DEFAULT_PACKS,
  DEFAULT_PRESENTATIONS,
  importPerfumeryCatalog,
  parseFragranceCsv,
  validateCatalog,
} from './catalog';

export interface PerfumeryImportBody {
  fragrances?: unknown;
  presentations?: unknown;
  extras?: unknown;
  packs?: unknown;
  csv?: unknown;
  useDefaultPresentations?: unknown;
  initialStockMl?: unknown;
  initialContainerStock?: unknown;
  updateExisting?: unknown;
}

const optionalStock = (value: unknown, max: number): number | null | 'invalid' => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : 'invalid';
};

export async function runPerfumeryImport(
  session: { storeId: string; userId: string },
  body: PerfumeryImportBody,
  extraMeta: Record<string, unknown> = {}
) {
  const initialStockMl = optionalStock(body.initialStockMl, 1_000_000);
  const initialContainerStock = optionalStock(body.initialContainerStock, 100_000);
  if (initialStockMl === 'invalid' || initialContainerStock === 'invalid') {
    return NextResponse.json({ error: 'Stock inicial inválido' }, { status: 400 });
  }

  const useDefaults = Boolean(body.useDefaultPresentations);
  const fragrances = typeof body.csv === 'string' ? parseFragranceCsv(body.csv) : body.fragrances;
  const pick = (list: unknown, defaults: unknown[]) =>
    Array.isArray(list) && list.length ? list : useDefaults ? defaults : [];
  const catalog = validateCatalog({
    fragrances: Array.isArray(fragrances) ? fragrances : [],
    presentations: pick(body.presentations, DEFAULT_PRESENTATIONS),
    extras: pick(body.extras, DEFAULT_EXTRAS),
    packs: pick(body.packs, DEFAULT_PACKS),
  } as never);
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
    meta: { ...result, ...extraMeta },
  }).catch(() => {});

  return NextResponse.json({ result: { ...result, ...extraMeta } });
}
