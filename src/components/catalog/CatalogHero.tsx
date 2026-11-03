import type { PublicCatalogStore } from '@/types/catalog';
import { CategoryIcon } from '@/components/pos/categoryIcon';
import type { CategorySummary } from './categoryTheme';
import { WhatsAppIcon } from './catalogIcons';

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
      <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] bg-white shadow-sm">
        <img
          src={store.bannerUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
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
    <div className={`grid gap-3 ${tiles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`} aria-hidden="true">
      {tiles.map((category) => (
        <div
          key={category.name}
          className="flex aspect-[4/3] items-center justify-center rounded-3xl p-4"
          style={{ backgroundColor: category.tint.bg, color: category.tint.ink }}
        >
          {category.imageUrl ? (
            <img src={category.imageUrl} alt="" className="h-full w-full object-contain mix-blend-multiply" />
          ) : (
            <CategoryIcon name={category.name} className="h-1/2 w-1/2" />
          )}
        </div>
      ))}
    </div>
  );
}

export function CatalogHero({ store, productCount, categories, onBrowse }: CatalogHeroProps) {
  const whatsapp = store.whatsappNumber;
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
    <section className="bg-[#e7f4ea]">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="min-w-0">
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.08] tracking-tight text-[#12261b] [overflow-wrap:anywhere]">
            Haz tu pedido en {store.name || 'nuestra tienda'}
          </h1>
          <p className="mt-4 max-w-md text-base text-neutral-700">
            Elige tus productos, arma tu carrito y envíanos el pedido por WhatsApp.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onBrowse}
              className="rounded-full bg-[#15803d] px-7 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[#166534] transition-colors"
            >
              Ver productos
            </button>
            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-[#15803d]/30 bg-white px-6 py-3.5 text-base font-semibold text-[#15803d] hover:bg-[#f6faf6] transition-colors"
              >
                <WhatsAppIcon />
                Escríbenos
              </a>
            ) : null}
          </div>

          <p className="mt-5 text-xs text-neutral-600">
            {productCount} {productCount === 1 ? 'producto' : 'productos'}
            {updatedLabel ? ` · Actualizado ${updatedLabel}` : ''}
          </p>
        </div>

        <HeroVisual store={store} categories={categories} />
      </div>
    </section>
  );
}
