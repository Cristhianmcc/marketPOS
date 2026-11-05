'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { PublicCatalogProduct, PublicCatalogStore } from '@/types/catalog';
import { CartDrawer } from '@/components/catalog/CartDrawer';
import { CatalogBottomNav } from './CatalogBottomNav';
import { CatalogFooter } from './CatalogFooter';
import { CatalogHero } from './CatalogHero';
import { WhatsAppIcon } from './catalogIcons';
import { CategoryFilter } from './CategoryFilter';
import { catalogThemeStyle } from '@/lib/catalog/palettes';
import { categoryOf, summarizeCategories } from './categoryTheme';
import { FeaturedProducts } from './FeaturedProducts';
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
const FEATURED_PRODUCTS = 8;

const GENDER_LABELS: Record<string, string> = { MUJER: 'Mujer', HOMBRE: 'Hombre', UNISEX: 'Unisex' };
const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’`´]/g, '');

export function CatalogPageClient({ store, products }: CatalogPageClientProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  // Perfumería: filtros por género, familia olfativa y temporada.
  const [gender, setGender] = useState('');
  const [family, setFamily] = useState('');
  const [season, setSeason] = useState('');
  const perfumeFilters = useMemo(() => {
    const perfumes = products.filter((product) => product.attributes?.kind === 'perfume');
    if (!perfumes.length) return null;
    const unique = (values: Array<string | null | undefined>) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));
    return {
      genders: unique(perfumes.map((p) => p.attributes!.gender)).filter((g) => GENDER_LABELS[g]),
      families: unique(perfumes.map((p) => p.attributes!.family)),
      seasons: unique(perfumes.flatMap((p) => p.attributes!.seasons)),
    };
  }, [products]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const productsRef = useRef<HTMLElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const categorySummaries = useMemo(() => summarizeCategories(products), [products]);
  const navCategories = useMemo(
    () =>
      [...categorySummaries]
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map((category) => category.name),
    [categorySummaries],
  );
  // Primero los que tienen foto; con pocos productos repetirían la lista completa
  const featuredProducts = useMemo(
    () =>
      products.length > FEATURED_PRODUCTS
        ? [...products]
            .sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)))
            .slice(0, FEATURED_PRODUCTS)
        : [],
    [products],
  );

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'Todos' || categoryOf(product) === selectedCategory;

      const term = fold(search.trim());
      const attributes = product.attributes;

      const matchesSearch =
        !term ||
        fold(product.name).includes(term) ||
        fold(product.description || '').includes(term) ||
        fold(product.category || '').includes(term) ||
        (attributes ? fold([attributes.code, attributes.reference, ...attributes.aromas].filter(Boolean).join(' ')).includes(term) : false);

      const matchesPerfume =
        (!gender || attributes?.gender === gender) &&
        (!family || attributes?.family === family) &&
        (!season || Boolean(attributes?.seasons.includes(season)));

      return matchesCategory && matchesSearch && matchesPerfume;
    });

    return filtered;
  }, [products, search, selectedCategory, gender, family, season]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, products, gender, family, season]);

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

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goToCategory = (category: string) => {
    setSearch('');
    setSelectedCategory(category);
    scrollToProducts();
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const focusSearch = () => {
    scrollToTop();
    searchRef.current?.focus({ preventScroll: true });
  };

  const searching = search.trim() !== '' || Boolean(gender || family || season);
  const showHome = selectedCategory === 'Todos' && !searching;
  const whatsappLink = store.whatsappNumber
    ? `https://wa.me/${store.whatsappNumber.replace(/[^\d]/g, '')}`
    : '';

  return (
    <main className="min-h-screen bg-[var(--cat-bg)] pb-24 text-neutral-900 sm:pb-0" style={catalogThemeStyle(store.palette)}>
      <StoreHeader
        store={store}
        navCategories={navCategories}
        selectedCategory={selectedCategory}
        cartItemsCount={cartItemsCount}
        onCartClick={() => setIsCartOpen(true)}
        onSearchClick={focusSearch}
        onCategoryClick={goToCategory}
      />

      <div className="max-w-6xl mx-auto px-4 pt-1">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--cat-ink)]" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full h-12 pl-12 pr-4 bg-white rounded-full text-sm outline-none shadow-[var(--cat-shadow)] focus:ring-2 focus:ring-[var(--cat-accent)]"
          />
        </div>
        {perfumeFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {['', ...perfumeFilters.genders].map((value) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setGender(value)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  gender === value ? 'bg-[var(--cat-primary)] text-white' : 'bg-white text-[var(--cat-ink)] shadow-[var(--cat-shadow)]'
                }`}
              >
                {value ? GENDER_LABELS[value] : 'Todos'}
              </button>
            ))}
            {perfumeFilters.families.length > 0 && (
              <select
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                className="h-8 rounded-full bg-white px-3 text-xs text-[var(--cat-ink)] shadow-[var(--cat-shadow)]"
                aria-label="Familia olfativa"
              >
                <option value="">Todas las familias</option>
                {perfumeFilters.families.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            )}
            {perfumeFilters.seasons.length > 0 && (
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="h-8 rounded-full bg-white px-3 text-xs text-[var(--cat-ink)] shadow-[var(--cat-shadow)]"
                aria-label="Temporada"
              >
                <option value="">Toda temporada</option>
                {perfumeFilters.seasons.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {!searching && (
        <CatalogHero
          store={store}
          productCount={products.length}
          categories={categorySummaries}
          onBrowse={scrollToProducts}
        />
      )}

      <div ref={categoriesRef} className="max-w-6xl mx-auto px-4 pt-5 scroll-mt-20">
        <CategoryFilter
          categories={categorySummaries}
          productCount={products.length}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      </div>

      {showHome && featuredProducts.length > 0 && (
        <FeaturedProducts
          products={featuredProducts}
          getQuantity={getQuantity}
          onAdd={addToCart}
          onRemove={(product) => decreaseQty(product.id)}
          onViewAll={scrollToProducts}
        />
      )}

      {showHome && whatsappLink && (
        <section className="max-w-6xl mx-auto px-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[var(--cat-soft)] p-5 sm:px-8">
            <div className="min-w-0">
              <p className="text-lg font-black leading-tight text-[var(--cat-ink)]">
                ¿No encuentras lo que buscas?
              </p>
              <p className="mt-0.5 text-sm text-[var(--cat-ink)]">
                Escríbenos y te ayudamos con tu pedido.
              </p>
            </div>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-[var(--cat-primary)] px-5 py-2.5 text-sm font-bold text-white"
            >
              <WhatsAppIcon />
              Escríbenos
            </a>
          </div>
        </section>
      )}

      <section ref={productsRef} className="scroll-mt-20">
        <div className="px-4 py-6 max-w-6xl mx-auto">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-black tracking-tight text-[var(--cat-ink)]">
            {selectedCategory === 'Todos' ? 'Todos los productos' : selectedCategory}
          </h2>
          <span className="shrink-0 text-sm text-neutral-600">
            {filteredProducts.length} productos
          </span>
        </div>

        <ProductGrid
          products={paginatedProducts}
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
                        ? 'bg-[var(--cat-primary)] text-white'
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

      <CatalogBottomNav
        whatsappNumber={store.whatsappNumber}
        cartItemsCount={cartItemsCount}
        onHomeClick={scrollToTop}
        onCategoriesClick={() =>
          categoriesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        onCartClick={() => setIsCartOpen(true)}
        onSearchClick={focusSearch}
      />

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

