// src/components/pos/QuickSellGrid.tsx
// ✅ MÓDULO 17.2: Quick Sell POS - Grid de productos rápidos
'use client';

import { useState, useEffect } from 'react';
import { Loader2, ShoppingCart, Package } from 'lucide-react';

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

export default function QuickSellGrid({ onAddProduct, disabled = false }: QuickSellGridProps) {
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
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* ✅ Header */}
      <div className="flex items-center gap-2 mb-3">
        <ShoppingCart className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-gray-900">Productos Rápidos</h3>
        <span className="text-xs text-gray-500 ml-auto">
          Click para agregar al carrito
        </span>
      </div>

      {/* ✅ Grid de productos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
                relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 
                transition-all duration-150
                ${
                  isDisabled
                    ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
                    : 'bg-white border-gray-300 hover:border-green-500 hover:shadow-md active:scale-95 cursor-pointer'
                }
              `}
            >
              {/* ✅ Imagen o Inicial */}
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center overflow-hidden">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xl font-bold text-green-700">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* ✅ Nombre del producto (truncado) */}
              <div className="w-full text-center">
                <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
                  {product.name}
                </p>
              </div>

              {/* ✅ Precio */}
              <div className="text-lg font-bold text-green-600">
                S/ {Number(product.price).toFixed(2)}
              </div>

              {/* ✅ Badge de stock bajo */}
              {isLowStock && !isOutOfStock && (
                <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {product.stock}
                </div>
              )}

              {/* ✅ Badge sin stock */}
              {isOutOfStock && (
                <div className="absolute top-1 right-1 bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  Sin stock
                </div>
              )}

              {/* ✅ Icono de agregar */}
              {!isDisabled && (
                <div className="absolute bottom-1 right-1 bg-green-500 text-white rounded-full p-1">
                  <ShoppingCart className="w-3 h-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
