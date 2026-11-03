import { ArrowRight } from 'lucide-react';
import type { PublicCatalogProduct } from '@/types/catalog';
import type { CategoryTint } from './categoryTheme';
import { ProductCard } from './ProductCard';

interface FeaturedProductsProps {
  products: PublicCatalogProduct[];
  getTint: (product: PublicCatalogProduct) => CategoryTint;
  getQuantity: (productId: string) => number;
  onAdd: (product: PublicCatalogProduct) => void;
  onRemove: (product: PublicCatalogProduct) => void;
  onViewAll: () => void;
}

export function FeaturedProducts({
  products,
  getTint,
  getQuantity,
  onAdd,
  onRemove,
  onViewAll,
}: FeaturedProductsProps) {
  return (
    <section className="max-w-6xl mx-auto px-4 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black tracking-tight text-[var(--cat-ink)]">Destacados</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="flex items-center gap-1 text-sm font-semibold text-[var(--cat-primary)]"
        >
          Ver todos
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
        {products.map((product) => (
          <div key={product.id} className="w-40 shrink-0 sm:w-48">
            <ProductCard
              product={product}
              tint={getTint(product)}
              quantity={getQuantity(product.id)}
              onAdd={() => onAdd(product)}
              onRemove={() => onRemove(product)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
