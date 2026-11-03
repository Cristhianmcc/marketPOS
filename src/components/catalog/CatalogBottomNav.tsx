import { Home, LayoutGrid, Search, ShoppingBag } from 'lucide-react';
import { WhatsAppIcon } from './catalogIcons';

interface CatalogBottomNavProps {
  whatsappNumber: string;
  cartItemsCount: number;
  onHomeClick: () => void;
  onCategoriesClick: () => void;
  onCartClick: () => void;
  onSearchClick: () => void;
}

const navItem = 'flex w-14 flex-col items-center gap-0.5 text-[11px] text-[var(--cat-ink)]';

export function CatalogBottomNav({
  whatsappNumber,
  cartItemsCount,
  onHomeClick,
  onCategoriesClick,
  onCartClick,
  onSearchClick,
}: CatalogBottomNavProps) {
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-full bg-white px-2 shadow-[0_8px_30px_rgba(0,0,0,0.16)] sm:hidden"
      aria-label="Navegación"
    >
      <button type="button" onClick={onHomeClick} className={navItem}>
        <Home className="h-5 w-5" />
        Inicio
      </button>
      <button type="button" onClick={onCategoriesClick} className={navItem}>
        <LayoutGrid className="h-5 w-5" />
        Categorías
      </button>

      <button
        type="button"
        onClick={onCartClick}
        className="relative -mt-7 flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-full border-4 border-[var(--cat-bg)] bg-[var(--cat-primary)] text-[11px] font-semibold text-white"
        aria-label="Ver pedido"
      >
        <ShoppingBag className="h-5 w-5" />
        Pedido
        {cartItemsCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--cat-accent)] px-1 text-xs font-bold text-[var(--cat-on-accent)]">
            {cartItemsCount}
          </span>
        )}
      </button>

      <button type="button" onClick={onSearchClick} className={navItem}>
        <Search className="h-5 w-5" />
        Buscar
      </button>
      {whatsappNumber ? (
        <a
          href={`https://wa.me/${whatsappNumber.replace(/[^\d]/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className={navItem}
        >
          <span className="flex h-5 w-5 items-center justify-center text-[#128C4B]">
            <WhatsAppIcon />
          </span>
          WhatsApp
        </a>
      ) : null}
    </nav>
  );
}
