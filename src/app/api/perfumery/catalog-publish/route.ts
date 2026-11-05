/**
 * POST /api/perfumery/catalog-publish (OWNER)
 * Marca todas las fragancias activas de la sede para el catálogo web (título,
 * descripción, categoría por género e imagen). Después se publica desde
 * Configuración → Catálogo Web como siempre.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { publishFragrancesInCatalog } from '@/lib/perfumery/catalogPublish';

export async function POST() {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  const count = await prisma.$transaction((tx) => publishFragrancesInCatalog(tx, session.storeId), { timeout: 60_000 });
  return NextResponse.json({ count });
}
