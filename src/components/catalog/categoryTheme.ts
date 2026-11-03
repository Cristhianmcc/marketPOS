import type { PublicCatalogProduct } from '@/types/catalog';

export interface CategorySummary {
  name: string;
  count: number;
  imageUrl: string | null;
}

export const categoryOf = (product: PublicCatalogProduct) => product.category || 'General';

/** Categorías por nombre, cada una con la primera foto disponible. */
export function summarizeCategories(products: PublicCatalogProduct[]): CategorySummary[] {
  const byName = new Map<string, { count: number; imageUrl: string | null }>();
  for (const product of products) {
    const name = categoryOf(product);
    const entry = byName.get(name) ?? { count: 0, imageUrl: null };
    entry.count += 1;
    entry.imageUrl = entry.imageUrl ?? product.imageUrl;
    byName.set(name, entry);
  }
  return Array.from(byName.keys())
    .sort()
    .map((name) => ({ name, ...byName.get(name)! }));
}
