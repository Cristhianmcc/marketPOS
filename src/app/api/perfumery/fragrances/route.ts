/**
 * GET /api/perfumery/fragrances?q=&gender=&family=
 * Fragancias activas de la sede con su stock de esencia (ml).
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { normalizeGender } from '@/lib/perfumery/catalog';

/** minúsculas, sin tildes ni signos: "J'adore Dior" → "jadore dior". */
const fold = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’`´.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function GET(request: NextRequest) {
  const { session, error } = await getPerfumerySession();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const q = (params.get('q') ?? '').trim();
  const gender = params.get('gender') ? normalizeGender(params.get('gender')) : null;
  const family = (params.get('family') ?? '').trim();

  const where: Prisma.FragranceWhereInput = {
    storeId: session.storeId,
    active: true,
    storeProduct: { active: true },
  };
  if (gender) where.gender = gender;
  if (family) where.family = family;

  // Una sede maneja cientos de fragancias: se filtra en memoria para ignorar
  // tildes, apóstrofos y espacios ("jadore" encuentra "J'adore").
  const [allFragrances, families] = await Promise.all([
    prisma.fragrance.findMany({
      where,
      include: { storeProduct: { select: { id: true, stock: true, minStock: true, product: { select: { name: true } } } } },
      orderBy: { code: 'asc' },
    }),
    prisma.fragrance.findMany({
      where: { storeId: session.storeId, active: true, family: { not: null } },
      distinct: ['family'],
      select: { family: true },
      orderBy: { family: 'asc' },
    }),
  ]);

  const terms = q ? fold(q).split(' ').filter(Boolean) : [];
  const fragrances = (terms.length
    ? allFragrances.filter((f) => {
        const haystack = fold([f.code, f.reference, f.referenceBrand, f.scent, f.family, ...f.aromas].filter(Boolean).join(' '));
        const compact = haystack.replace(/ /g, '');
        return terms.every((term) => haystack.includes(term) || compact.includes(term));
      })
    : allFragrances
  ).slice(0, 500);

  return NextResponse.json({
    fragrances: fragrances.map((f) => ({
      id: f.id,
      storeProductId: f.storeProduct.id,
      code: f.code,
      name: f.storeProduct.product.name,
      reference: f.reference,
      referenceBrand: f.referenceBrand,
      gender: f.gender,
      family: f.family,
      aromas: f.aromas,
      seasons: f.seasons,
      occasions: f.occasions,
      scent: f.scent,
      imageUrl: f.imageUrl,
      stockMl: f.storeProduct.stock?.toNumber() ?? null,
      minStockMl: f.storeProduct.minStock?.toNumber() ?? null,
    })),
    families: families.map((f) => f.family).filter(Boolean),
  });
}
