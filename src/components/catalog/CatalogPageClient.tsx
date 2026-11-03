'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { PublicCatalogProduct, PublicCatalogStore } from '@/types/catalog';
import { CartDrawer } from '@/components/catalog/CartDrawer';
import { CatalogFooter } from './CatalogFooter';
import { CatalogHero } from './CatalogHero';
import { CategoryFilter } from './CategoryFilter';
import { CategoryGrid } from './CategoryGrid';
import { categoryOf, DEFAULT_TINT, summarizeCategories } from './categoryTheme';
import { ProductGrid } from './ProductGrid';
import { StoreHeader } from './StoreHeader';

interface CatalogPageClientProps {
  store: PublicCatalogStore;
  products: PublicCatalogProduct[];
}

export interface CartItem extends PublicCatalogProduct {
  quantity: number;
}

const PRODUCTS_PER_PAGE = 20;

export function CatalogPageClient({ store, products }: CatalogPageClientProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const productsRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const categorySummaries = useMemo(() => summarizeCategories(products), [products]);
  const categories = useMemo(
    () => ['Todos', ...categorySummaries.map((category) => category.name)],
    [categorySummaries],
  );
  const navCategories = useMemo(
    () =>
      [...categorySummaries]
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map((category) => category.name),
    [categorySummaries],
  );

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'Todos' || categoryOf(product) === selectedCategory;

      const term = search.trim().toLowerCase();

      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        (product.description || '').toLowerCase().includes(term) ||
        (product.category || '').toLowerCase().includes(term);

      return matchesCategory && matchesSearch;
    });

    return filtered;
  }, [products, search, selectedCategory]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, products]);

  const paginatedProducts = useMemo(() => {
    const startIdx = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIdx, startIdx + PRODUCTS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);

  const addToCart = (product: PublicCatalogProduct) => {
    setCart((prev) => {
      const found = prev.find((item) => item.id === product.id);

      if (found) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const increaseQty = (productId: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === productId ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    );
  };

  const decreaseQty = (productId: string) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const getQuantity = (productId: string) =>
    cart.find((item) => item.id === productId)?.quantity ?? 0;

  const getTint = (product: PublicCatalogProduct) =>
    categorySummaries.find((category) => category.name === categoryOf(product))?.tint ?? DEFAULT_TINT;

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goToCategory = (category: string) => {
    setSearch('');
    setSelectedCategory(category);
    scrollToProducts();
  };

  const focusSearch = () => {
    scrollToProducts();
    searchRef.current?.focus({ preventScroll: true });
  };

  return (
    <main className="min-h-screen bg-[#f6faf6] text-neutral-900">
      <StoreHeader
        store={store}
        navCategories={navCategories}
        selectedCategory={selectedCategory}
        cartItemsCount={cartItemsCount}
        onCartClick={() => setIsCartOpen(true)}
        onSearchClick={focusSearch}
        onCategoryClick={goToCategory}
      />

      <CatalogHero
        store={store}
        productCount={products.length}
        categories={categorySummaries}
        onBrowse={scrollToProducts}
      />

      <CategoryGrid
        categories={categorySummaries}
        selectedCategory={selectedCategory}
        onSelectCategory={goToCategory}
      />

      <section ref={productsRef} className="scroll-mt-16 pt-6">
        <div className="sticky top-16 z-40 bg-[#f6faf6]/95 backdrop-blur border-b border-neutral-200/70 px-4 py-2.5">
          <div className="max-w-6xl mx-auto">
            <CategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
          </div>
        </div>

        <div className="px-4 py-6 max-w-6xl mx-auto">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold tracking-tight">
            {selectedCategory === 'Todos' ? 'Todos los productos' : selectedCategory}
          </h2>

          <div className="flex items-center gap-3">
            <span className="shrink-0 text-sm text-neutral-600">
              {filteredProducts.length} productos
            </span>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full pl-9 pr-3 py-2 bg-white/90 border border-neutral-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-[#15803d]/20 focus:border-[#15803d]/40 shadow-sm"
              />
            </div>
          </div>
        </div>

        <ProductGrid
          products={paginatedProducts}
          getTint={getTint}
          getQuantity={getQuantity}
          onAdd={addToCart}
          onRemove={(product) => decreaseQty(product.id)}
        />

        {totalPages > 1 && (
          <div className="mt-10 flex flex-col items-center justify-center gap-3">
            <div className="text-sm text-neutral-600 font-semibold">
              Mostrando página {currentPage} de {totalPages}
            </div>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>

              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (currentPage <= 4) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = currentPage - 3 + i;
                  }
                  return pageNum;
                }).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 rounded-lg font-medium text-sm transition-colors ${
                      currentPage === page
                        ? 'bg-[#15803d] text-white'
                        : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
        </div>
      </section>

      <CatalogFooter store={store} />

      <CartDrawer
        store={store}
        cart={cart}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onIncrease={increaseQty}
        onDecrease={decreaseQty}
        onRemove={removeItem}
      />
    </main>
  );
}

