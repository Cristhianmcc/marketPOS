import { ArrowRight } from 'lucide-react';
import type { PublicCatalogStore } from '@/types/catalog';
import { CategoryIcon } from '@/components/pos/categoryIcon';
import type { CategorySummary } from './categoryTheme';

interface CatalogHeroProps {
  store: PublicCatalogStore;
  productCount: number;
  categories: CategorySummary[];
  onBrowse: () => void;
}

function HeroVisual({ store, categories }: Pick<CatalogHeroProps, 'store' | 'categories'>) {
  if (store.bannerUrl) {
    // El banner puede tener cualquier proporción: se muestra completo sobre su propio fondo
    return (
      <div className="relative aspect-[2/1] sm:aspect-[16/10] overflow-hidden rounded-2xl">
        <img
          src={store.bannerUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-2xl"
        />
        <img
          src={store.bannerUrl}
          alt={store.name}
          className="relative h-full w-full object-contain"
        />
      </div>
    );
  }

  const tiles = [...categories].sort((a, b) => b.count - a.count).slice(0, 4);
  if (tiles.length === 0) return null;

  return (
    <div className="mx-auto grid max-w-xs grid-cols-2 gap-3" aria-hidden="true">
      {tiles.map((category) => (
        <div
          key={category.name}
          className="flex aspect-square items-center justify-center rounded-full bg-white p-5 text-[var(--cat-primary)]"
        >
          {category.imageUrl ? (
            <img src={category.imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <CategoryIcon name={category.name} className="h-3/5 w-3/5" />
          )}
        </div>
      ))}
    </div>
  );
}

export function CatalogHero({ store, productCount, categories, onBrowse }: CatalogHeroProps) {
  const updatedLabel = (() => {
    try {
      return new Intl.DateTimeFormat('es-PE', {
        day: '2-digit',
        month: 'short',
      }).format(new Date(store.updatedAt));
    } catch {
      return '';
    }
  })();

  return (
    <section className="max-w-6xl mx-auto px-4 pt-4">
      <div className="grid items-center overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--cat-hero-from)] to-[var(--cat-hero-to)] text-white sm:grid-cols-2">
        <div className="min-w-0 p-6 sm:p-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase leading-[1.05] tracking-tight">
            Todo lo que necesitas,
            <span className="mt-1 block font-bold normal-case italic text-[var(--cat-hero-highlight)]">a un mensaje</span>
          </h2>
          <p className="mt-3 max-w-sm text-sm sm:text-base text-white/85">
            Arma tu pedido y envíalo por WhatsApp.
          </p>

          <button
            type="button"
            onClick={onBrowse}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--cat-accent)] py-2.5 pl-6 pr-2.5 text-base font-bold text-[var(--cat-on-accent)] hover:bg-[var(--cat-accent-hover)] transition-colors"
          >
            Pedir ahora
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--cat-ink)]">
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>

          <p className="mt-4 text-xs text-white/70">
            {productCount} {productCount === 1 ? 'producto' : 'productos'}
            {updatedLabel ? ` · Actualizado ${updatedLabel}` : ''}
          </p>
        </div>

        <div className="min-w-0 px-5 pb-5 sm:py-6 sm:pl-0 sm:pr-6">
          <HeroVisual store={store} categories={categories} />
        </div>
      </div>
    </section>
  );
}
