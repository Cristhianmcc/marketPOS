import { Minus, Plus } from 'lucide-react';
import type { PublicCatalogProduct } from '@/types/catalog';

interface ProductCardProps {
  product: PublicCatalogProduct;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}

const accentPool = [
  '#0f766e',
  '#1d4ed8',
  '#b91c1c',
  '#7c2d12',
  '#166534',
  '#155e75',
  '#6d28d9',
  '#111827',
];

function pickAccent(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 29 + label.charCodeAt(i)) % accentPool.length;
  }
  return accentPool[Math.abs(hash)];
}

export function ProductCard({
  product,
  quantity,
  onAdd,
  onRemove,
}: ProductCardProps) {
  const accent = pickAccent(product.category || product.name);

  return (
    <div className="group relative">
      <div
        className="bg-white border border-neutral-200 overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
        style={{ borderRadius: '22px 22px 10px 22px' }}
      >
        <div className="aspect-square bg-neutral-50 overflow-hidden relative">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
              Sin imagen
            </div>
          )}
          {product.category && (
            <div
              className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
            >
              {product.category}
            </div>
          )}
        </div>

        <div className="p-3">
          <h3 className="text-sm mb-1 line-clamp-2 leading-snug">
            {product.name}
          </h3>
          {product.description ? (
            <p className="text-xs text-neutral-500 mb-2 line-clamp-2">
              {product.description}
            </p>
          ) : null}
          <div className="flex items-end justify-between">
            <p className="text-lg tracking-tight text-black">
              S/ {product.price.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 right-3">
        {quantity === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="bg-black text-white p-2 rounded-full shadow-lg hover:bg-neutral-800 transition-all hover:scale-110 active:scale-95"
            aria-label="Agregar al carrito"
          >
            <Plus className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 bg-black text-white rounded-full shadow-lg p-1">
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 hover:bg-neutral-800 rounded-full transition-colors"
              aria-label="Quitar del carrito"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-sm min-w-[20px] text-center">{quantity}</span>
            <button
              type="button"
              onClick={onAdd}
              className="p-1.5 hover:bg-neutral-800 rounded-full transition-colors"
              aria-label="Agregar al carrito"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
