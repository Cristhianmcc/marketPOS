import type { PublicCatalogProduct } from '@/types/catalog';

export interface CategoryTint {
  bg: string;
  ink: string;
}

export interface CategorySummary {
  name: string;
  tint: CategoryTint;
  count: number;
  imageUrl: string | null;
}

const TINTS: CategoryTint[] = [
  { bg: '#fdeccf', ink: '#92400e' },
  { bg: '#dcefe0', ink: '#166534' },
  { bg: '#dbe8f7', ink: '#1e40af' },
  { bg: '#f9dfdc', ink: '#b91c1c' },
  { bg: '#e9e1f8', ink: '#6d28d9' },
  { bg: '#d6eff0', ink: '#0f766e' },
];

export const DEFAULT_TINT = TINTS[0];

export const categoryOf = (product: PublicCatalogProduct) => product.category || 'General';

/** Categorías por nombre, cada una con su color y la primera foto disponible. */
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
    .map((name, index) => ({
      name,
      tint: TINTS[index % TINTS.length],
      ...byName.get(name)!,
    }));
}
