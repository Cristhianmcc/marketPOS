'use client';

import { Search, Barcode, Package2, Plus } from 'lucide-react';
import Image from 'next/image';

export interface Product {
  id: string;
  name: string;
  barcode?: string;
  price: number;
  cost?: number;
  category?: string;
  stock: number;
  imageUrl?: string;
  description?: string;
  isActive?: boolean;
}

interface ProductCatalogProps {
  products: Product[];
  categories: string[];
  selectedCategory: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCategoryChange: (category: string) => void;
  onProductSelect: (product: Product) => void;
}

export function ProductCatalog({
  products,
  categories,
  selectedCategory,
  searchQuery,
  onSearchChange,
  onCategoryChange,
  onProductSelect,
}: ProductCatalogProps) {
  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      {/* Search Bar */}
      <div className="px-6 py-4 border-b border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar producto por nombre o escanear código de barras..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-12 pl-11 pr-12 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-main dark:text-white placeholder:text-text-secondary dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary dark:text-gray-500" />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors"
            title="Escanear código de barras"
          >
            <Barcode className="w-5 h-5 text-text-secondary dark:text-gray-500" />
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="px-6 py-4 border-b border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mask-fade-right pb-1">
          <button
            onClick={() => onCategoryChange('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-background-light dark:bg-background-dark text-text-secondary dark:text-gray-400 hover:text-text-main dark:hover:text-white border border-border-light dark:border-border-dark'
            }`}
          >
            Todos
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => onCategoryChange(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                selectedCategory === category
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-background-light dark:bg-background-dark text-text-secondary dark:text-gray-400 hover:text-text-main dark:hover:text-white border border-border-light dark:border-border-dark'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-background-light dark:bg-background-dark border-2 border-dashed border-border-light dark:border-border-dark flex items-center justify-center mb-4">
              <Package2 className="w-10 h-10 text-text-secondary dark:text-gray-500" />
            </div>
            <p className="text-lg font-semibold text-text-main dark:text-white mb-1">
              No hay productos
            </p>
            <p className="text-sm text-text-secondary dark:text-gray-400">
              {searchQuery ? 'No se encontraron productos con ese criterio de búsqueda' : 'Agrega productos al inventario para comenzar a vender'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => onProductSelect(product)}
                className="group relative flex flex-col bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary dark:hover:border-primary hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                {/* Product Image */}
                <div className="relative aspect-square bg-background-light dark:bg-background-dark overflow-hidden">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Package2 className="w-12 h-12 text-text-secondary/30 dark:text-gray-600" />
                    </div>
                  )}
                  
                  {/* Stock Badge */}
                  <div className="absolute top-2 right-2">
                    {product.stock === 0 ? (
                      <span className="px-2 py-1 text-xs font-semibold rounded-md bg-red-500 text-white">
                        Agotado
                      </span>
                    ) : product.stock <= 5 ? (
                      <span className="px-2 py-1 text-xs font-semibold rounded-md bg-orange-500 text-white">
                        Bajo stock
                      </span>
                    ) : null}
                  </div>

                  {/* Add Button Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="w-10 h-10 rounded-full bg-primary shadow-lg flex items-center justify-center">
                      <Plus className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>

                {/* Product Info */}
                <div className="p-3 space-y-1">
                  <h3 className="font-semibold text-sm text-text-main dark:text-white line-clamp-2 text-left">
                    {product.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className="text-lg font-bold text-primary">
                      ${product.price.toLocaleString('es-AR')}
                    </p>
                    <p className="text-xs text-text-secondary dark:text-gray-400">
                      Stock: {product.stock}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
