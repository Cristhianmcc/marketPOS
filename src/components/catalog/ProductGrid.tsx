'use client';

import { useEffect, useRef } from 'react';
import type { PublicCatalogProduct } from '@/types/catalog';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: PublicCatalogProduct[];
  getQuantity: (productId: string) => number;
  onAdd: (product: PublicCatalogProduct) => void;
  onRemove: (product: PublicCatalogProduct) => void;
}

export function ProductGrid({ products, getQuantity, onAdd, onRemove }: ProductGridProps) {
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' },
    );

    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [products]);

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-12 text-center">
        <p className="text-base font-medium text-neutral-700">
          No se encontraron productos para esta búsqueda.
        </p>
        <p className="text-sm text-neutral-500 mt-2">
          Intenta con otros términos o categorías.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {products.map((product, index) => (
        <div
          key={product.id}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          className="reveal-on-scroll"
          style={{ transitionDelay: `${Math.min(index, 10) * 40}ms` }}
        >
          <ProductCard
            product={product}
            quantity={getQuantity(product.id)}
            onAdd={() => onAdd(product)}
            onRemove={() => onRemove(product)}
          />
        </div>
      ))}
    </div>
  );
}

