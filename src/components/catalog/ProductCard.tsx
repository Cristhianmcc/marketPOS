'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { CategoryIcon } from '@/components/pos/categoryIcon';
import type { PublicCatalogProduct } from '@/types/catalog';

interface ProductCardProps {
  product: PublicCatalogProduct;
  getQuantity: (productId: string) => number;
  onAdd: (product: PublicCatalogProduct) => void;
  onRemove: (product: PublicCatalogProduct) => void;
}

/**
 * Perfumería: cada presentación es un ítem distinto del pedido
 * ("F754 Inspirado en J'adore - 100 ml" a su precio).
 */
function perfumeVariant(product: PublicCatalogProduct, index: number): PublicCatalogProduct {
  const option = product.attributes?.options[index];
  if (!option) return product;
  return { ...product, id: `${product.id}::${index}`, name: `${product.name} - ${option.name}`, price: option.price };
}

export function ProductCard({
  product,
  getQuantity,
  onAdd: addProduct,
  onRemove: removeProduct,
}: ProductCardProps) {
  const options = product.attributes?.options ?? [];
  const [optionIndex, setOptionIndex] = useState(() => {
    const regular = options.findIndex((option) => !option.note);
    return regular >= 0 ? regular : 0;
  });
  const item = options.length ? perfumeVariant(product, optionIndex) : product;
  const option = options[optionIndex];
  const quantity = getQuantity(item.id);
  const onAdd = () => addProduct(item);
  const onRemove = () => removeProduct(item);
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-[var(--cat-shadow)] transition-all duration-300 hover:-translate-y-0.5">
      <div className="relative aspect-[5/4] overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--cat-soft)] text-[var(--cat-primary)]">
              <CategoryIcon name={product.category} className="h-10 w-10" />
            </span>
          </div>
        )}
        {product.category && (
          <div className="absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-full bg-[var(--cat-primary)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {product.category}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-1">
        <h3 className="mb-0.5 line-clamp-2 text-sm font-bold leading-snug text-[var(--cat-ink)]">
          {product.name}
        </h3>
        {product.description ? (
          <p className="mb-1 line-clamp-2 text-xs text-neutral-500">
            {product.description}
          </p>
        ) : null}
        {options.length > 0 && (
          <select
            value={optionIndex}
            onChange={(e) => setOptionIndex(Number(e.target.value))}
            className="mb-1 h-8 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs text-[var(--cat-ink)]"
            aria-label="Presentación"
          >
            {options.map((o, index) => (
              <option key={`${o.name}-${index}`} value={index}>
                {o.name} · S/ {o.price.toFixed(2)}{o.note ? ` (${o.note.toLowerCase()})` : ''}
              </option>
            ))}
          </select>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-lg font-black tracking-tight text-[var(--cat-ink)]">
            S/ {item.price.toFixed(2)}
            {option?.listPrice && option.listPrice > option.price ? (
              <span className="ml-1.5 text-xs font-semibold text-neutral-400 line-through">S/ {option.listPrice.toFixed(2)}</span>
            ) : null}
          </p>

          {quantity === 0 ? (
            <button
              type="button"
              onClick={onAdd}
              className="rounded-full bg-[var(--cat-accent)] p-2 text-[var(--cat-on-accent)] transition-all hover:scale-110 hover:bg-[var(--cat-accent-hover)] active:scale-95"
              aria-label="Agregar al carrito"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-full bg-[var(--cat-accent)] p-1 text-[var(--cat-on-accent)]">
              <button
                type="button"
                onClick={onRemove}
                className="rounded-full p-1.5 transition-colors hover:bg-[var(--cat-accent-hover)]"
                aria-label="Quitar del carrito"
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
              <span className="min-w-[20px] text-center text-sm font-bold">{quantity}</span>
              <button
                type="button"
                onClick={onAdd}
                className="rounded-full p-1.5 transition-colors hover:bg-[var(--cat-accent-hover)]"
                aria-label="Agregar al carrito"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
