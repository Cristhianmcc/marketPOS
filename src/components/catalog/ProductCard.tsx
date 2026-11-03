import { Minus, Plus } from 'lucide-react';
import { CategoryIcon } from '@/components/pos/categoryIcon';
import type { PublicCatalogProduct } from '@/types/catalog';
import type { CategoryTint } from './categoryTheme';

interface ProductCardProps {
  product: PublicCatalogProduct;
  tint: CategoryTint;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}

export function ProductCard({
  product,
  tint,
  quantity,
  onAdd,
  onRemove,
}: ProductCardProps) {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className="relative aspect-square overflow-hidden"
        style={{ backgroundColor: product.imageUrl ? '#ffffff' : tint.bg, color: tint.ink }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CategoryIcon name={product.category} className="h-1/3 w-1/3 opacity-80" />
          </div>
        )}
        {product.category && (
          <div
            className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: tint.ink }}
          >
            {product.category}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="mb-1 line-clamp-2 text-sm leading-snug">{product.name}</h3>
        {product.description ? (
          <p className="mb-2 line-clamp-2 text-xs text-neutral-500">
            {product.description}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-lg font-bold tracking-tight text-[#12261b]">
            S/ {product.price.toFixed(2)}
          </p>

          {quantity === 0 ? (
            <button
              type="button"
              onClick={onAdd}
              className="rounded-full bg-[#15803d] p-2.5 text-white transition-all hover:scale-110 hover:bg-[#166534] active:scale-95"
              aria-label="Agregar al carrito"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-full bg-[#15803d] p-1 text-white">
              <button
                type="button"
                onClick={onRemove}
                className="rounded-full p-1.5 transition-colors hover:bg-[#166534]"
                aria-label="Quitar del carrito"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[20px] text-center text-sm font-semibold">{quantity}</span>
              <button
                type="button"
                onClick={onAdd}
                className="rounded-full p-1.5 transition-colors hover:bg-[#166534]"
                aria-label="Agregar al carrito"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
