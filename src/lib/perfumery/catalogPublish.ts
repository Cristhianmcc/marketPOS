/**
 * Perfumería: datos de catálogo web de las esencias de la sede.
 * - Al publicar: precio "desde" y atributos por fragancia publicada.
 * - Desde Perfumería: marcar todas las fragancias activas para el catálogo.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { buildCatalogOptions, catalogFromPrice, type PerfumeCatalogAttributes } from './catalogAttributes';
import { categoryForGender, normalizeGender } from './catalog';

type Db = PrismaClient | Prisma.TransactionClient;

export async function perfumeCatalogEntries(
  db: Db,
  storeId: string,
  storeProductIds: string[]
): Promise<Map<string, { attributes: PerfumeCatalogAttributes; price: number | null }>> {
  const result = new Map<string, { attributes: PerfumeCatalogAttributes; price: number | null }>();
  if (!storeProductIds.length) return result;
  const [fragrances, presentations] = await Promise.all([
    db.fragrance.findMany({ where: { storeId, storeProductId: { in: storeProductIds } } }),
    db.perfumePresentation.findMany({ where: { storeId, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ]);
  const options = buildCatalogOptions(
    presentations.map((p) => ({
      name: p.name,
      essenceMl: p.essenceMl.toNumber(),
      price: p.price.toNumber(),
      listPrice: p.listPrice?.toNumber() ?? null,
      isRefill: p.isRefill,
      requiresPriorPurchase: p.requiresPriorPurchase,
    }))
  );
  const price = catalogFromPrice(options);
  for (const f of fragrances) {
    result.set(f.storeProductId, {
      price,
      attributes: {
        kind: 'perfume',
        code: f.code,
        gender: f.gender,
        family: f.family,
        seasons: f.seasons,
        occasions: f.occasions,
        aromas: f.aromas,
        reference: [f.reference, f.referenceBrand].filter(Boolean).join(' de ') || null,
        options,
      },
    });
  }
  return result;
}

/** Marca las fragancias activas de la sede para el catálogo web. */
export async function publishFragrancesInCatalog(db: Db, storeId: string): Promise<number> {
  const fragrances = await db.fragrance.findMany({
    where: { storeId, active: true, storeProduct: { active: true } },
    include: { storeProduct: { select: { id: true, product: { select: { name: true, imageUrl: true } } } } },
  });
  for (const f of fragrances) {
    await db.storeProduct.update({
      where: { id: f.storeProduct.id },
      data: {
        publishInCatalog: true,
        catalogVisible: true,
        catalogTitle: f.storeProduct.product.name,
        catalogDescription: [f.scent, f.family].filter(Boolean).join(' · ') || null,
        catalogCategory: categoryForGender(normalizeGender(f.gender, f.code)),
        catalogImagePath: f.imageUrl ?? f.storeProduct.product.imageUrl,
        catalogUpdatedAt: new Date(),
      },
    });
  }
  return fragrances.length;
}
