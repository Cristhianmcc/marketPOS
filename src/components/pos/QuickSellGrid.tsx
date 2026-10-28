// src/components/pos/QuickSellGrid.tsx
// ✅ MÓDULO 17.2: Quick Sell POS - Grid de productos rápidos
'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { categoryImage } from './categoryImage';

interface QuickSellProduct {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  imageUrl: string | null;
  category: string;
  isQuickSell: boolean;
  totalSold: number;
}

interface QuickSellGridProps {
  onAddProduct: (productId: string) => void;
  disabled?: boolean;
}

import React, { memo } from 'react';

function QuickSellGridComponent({ onAddProduct, disabled = false }: QuickSellGridProps) {
  const [products, setProducts] = useState<QuickSellProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadQuickSellProducts();
  }, []);

  const loadQuickSellProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/pos/quick-sell?limit=8');
      
      if (!response.ok) {
        throw new Error('Error al cargar productos rápidos');
      }

      const data = await response.json();
      setProducts(data);
    } catch (err) {
      console.error('[QuickSellGrid] Error:', err);
      setError('Error al cargar productos rápidos');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Prevenir hydration mismatch
  if (!mounted) {
    return null;
  }

  // ✅ No mostrar si no hay productos
  if (!loading && products.length === 0) {
    return null;
  }

  // ✅ No mostrar si hay error
  if (error) {
    return null;
  }

  // ✅ Loading state
  if (loading) {
    return (
      <div className="rounded-2xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ✅ Header */}
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-lg font-bold text-text-main dark:text-text-light">Productos rápidos</h3>
        <span className="ml-auto rounded-full bg-surface-light dark:bg-surface-dark px-3 py-1 text-xs font-semibold text-text-secondary shadow-soft">Toca para agregar</span>
      </div>

      {/* ✅ Grid de productos - Responsive con botones grandes táctiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
        {products.map((product) => {
          const isOutOfStock = product.stock !== null && product.stock <= 0;
          const isLowStock = product.stock !== null && product.stock > 0 && product.stock <= 5;
          const isDisabled = disabled || isOutOfStock;

          return (
            <button
              key={product.id}
              onClick={() => !isDisabled && onAddProduct(product.id)}
              disabled={isDisabled}
              className={`
                relative flex flex-col gap-2 p-3 rounded-2xl text-left
                bg-surface-light dark:bg-surface-dark shadow-soft
                transition-shadow duration-150
                ${
                  isDisabled
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:shadow-medium active:scale-[0.98] cursor-pointer touch-manipulation'
                }
              `}
            >
              {/* ✅ Imagen o Inicial - Tamaño táctil */}
              <div className="relative w-full h-28 rounded-xl bg-monterrial-lavender/60 dark:bg-background-dark flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={categoryImage(product.category)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                {product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </div>

              {/* ✅ Nombre del producto (truncado) */}
              <div className="w-full">
                <p className="text-sm font-bold text-text-main dark:text-text-light line-clamp-2 leading-snug min-h-[2.5em]">
                  {product.name}
                </p>
              </div>

              {/* ✅ Precio - Tamaño táctil */}
              <div className="mt-auto pr-10 text-lg font-extrabold text-primary">
                S/ {Number(product.price).toFixed(2)}
              </div>

              {/* ✅ Badge de stock bajo */}
              {isLowStock && !isOutOfStock && (
                <div className="absolute top-4 right-4 bg-orange-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {product.stock}
                </div>
              )}

              {/* ✅ Badge sin stock */}
              {isOutOfStock && (
                <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  Sin stock
                </div>
              )}

              {/* ✅ Icono de agregar */}
              {!isDisabled && (
                <div className="absolute bottom-3 right-3 w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center shadow-md shadow-primary/30">
                  <Plus className="w-5 h-5" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ✅ MÓDULO 18.2: React.memo para evitar re-renders innecesarios
export default memo(QuickSellGridComponent);
