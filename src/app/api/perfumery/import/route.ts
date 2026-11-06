/**
 * POST /api/perfumery/import (OWNER)
 * { fragrances?, presentations?, extras?, packs?, csv?, useDefaultPresentations?,
 *   initialStockMl?, initialContainerStock?, updateExisting? }
 * useDefaultPresentations también carga los extras y packs de referencia si el
 * archivo no trae los suyos. Para un ZIP con fotos: /api/perfumery/import/zip.
 *
 * Carga el catálogo en la sede actual: esencia (producto en ml), fragancia,
 * presentaciones y envases. Nunca cambia el stock de lo que ya existe; el
 * stock se mueve con compras y ajustes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { runPerfumeryImport } from '@/lib/perfumery/importRequest';

export async function POST(request: NextRequest) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  return runPerfumeryImport(session, body);
}
