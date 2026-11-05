/**
 * GET /api/perfumery/export (OWNER)
 * Catálogo de la sede (fragancias + presentaciones) en el formato del
 * importador, para cargarlo en otra sede. No incluye stock ni ventas.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { exportPerfumeryCatalog } from '@/lib/perfumery/catalog';

export async function GET() {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  const catalog = await exportPerfumeryCatalog(prisma, session.storeId);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify({ format: 'perfumeria-catalogo', version: 1, ...catalog }, null, 1), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="catalogo-perfumeria-${date}.json"`,
    },
  });
}
