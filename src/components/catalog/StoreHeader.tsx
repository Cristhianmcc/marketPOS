'use client';

import { useState } from 'react';
import { Search, Share2, ShoppingBag } from 'lucide-react';
import type { PublicCatalogStore } from '@/types/catalog';
import { WhatsAppIcon } from './catalogIcons';

interface StoreHeaderProps {
  store: PublicCatalogStore;
  navCategories: string[];
  selectedCategory: string;
  cartItemsCount: number;
  onCartClick: () => void;
  onSearchClick: () => void;
  onCategoryClick: (category: string) => void;
}

const iconButton =
  'h-11 w-11 rounded-2xl bg-white flex items-center justify-center text-[var(--cat-ink)] shadow-[var(--cat-shadow)] hover:bg-[var(--cat-soft)] transition-colors';

export function StoreHeader({
  store,
  navCategories,
  selectedCategory,
  cartItemsCount,
  onCartClick,
  onSearchClick,
  onCategoryClick,
}: StoreHeaderProps) {
  const whatsapp = store.whatsappNumber;
  const [shareLabel, setShareLabel] = useState('Compartir');

  const handleShare = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: store.name || 'Catálogo', url });
        return;
      }
    } catch {
      // fall through to clipboard
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setShareLabel('Copiado');
        window.setTimeout(() => setShareLabel('Compartir'), 1800);
        return;
      }
    } catch {
      // fall through to legacy copy
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) {
        setShareLabel('Copiado');
        window.setTimeout(() => setShareLabel('Compartir'), 1800);
        return;
      }
    } catch {
      // fall through to prompt
    }

    window.prompt('Copia este enlace', url);
  };

  return (
    <header className="sticky top-0 z-40 h-[4.5rem] bg-[var(--cat-bg)]">
      <div className="h-full max-w-6xl mx-auto px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {store.logoUrl ? (
            <img
              src={store.logoUrl}
              alt={store.name}
              className="h-11 w-11 shrink-0 rounded-2xl object-cover bg-white shadow-[var(--cat-shadow)]"
            />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-white flex items-center justify-center text-base font-black text-[var(--cat-primary)] shadow-[var(--cat-shadow)]">
              {store.name ? store.name.slice(0, 1).toUpperCase() : 'M'}
            </div>
          )}

          <div className="min-w-0">
            <div className="text-xs text-[var(--cat-ink)]">¡Hola! 👋</div>
            <h1 className="text-xl font-black leading-tight tracking-tight text-[var(--cat-primary)] truncate">
              {store.name || 'Catálogo'}
            </h1>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-6 min-w-0" aria-label="Categorías">
          {navCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryClick(category)}
              className={`text-sm whitespace-nowrap transition-colors ${
                category === selectedCategory
                  ? 'font-bold text-[var(--cat-accent-text)]'
                  : 'text-[var(--cat-ink)] hover:text-[var(--cat-primary)]'
              }`}
            >
              {category}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSearchClick}
            className={`hidden sm:flex ${iconButton}`}
            aria-label="Buscar productos"
            title="Buscar productos"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleShare}
            className={iconButton}
            aria-label={shareLabel}
            title={shareLabel}
          >
            <Share2 className="w-5 h-5" />
          </button>

          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex h-11 w-11 rounded-2xl bg-[#25D366] text-white items-center justify-center hover:bg-[#20BA5A] transition-colors"
              aria-label="WhatsApp"
            >
              <WhatsAppIcon />
            </a>
          ) : null}

          <button
            type="button"
            onClick={onCartClick}
            className={`relative ${iconButton}`}
            aria-label="Carrito"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartItemsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-[var(--cat-primary)] text-white text-xs font-bold flex items-center justify-center rounded-full">
                {cartItemsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
