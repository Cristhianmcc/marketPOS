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
  'h-10 w-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-800 hover:bg-neutral-50 transition-colors';

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
    <header className="sticky top-0 z-50 h-16 border-b border-neutral-200/70 bg-[#f6faf6]/95 backdrop-blur">
      <div className="h-full max-w-6xl mx-auto px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {store.logoUrl ? (
            <img
              src={store.logoUrl}
              alt={store.name}
              className="h-10 w-10 shrink-0 rounded-full object-cover border border-neutral-200 bg-white"
            />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-sm font-semibold text-neutral-700">
              {store.name ? store.name.slice(0, 1).toUpperCase() : 'M'}
            </div>
          )}

          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight truncate">
              {store.name || 'Catálogo'}
            </div>
            <div className="text-[11px] text-neutral-500 truncate">@{store.slug}</div>
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
                  ? 'font-semibold text-[#15803d]'
                  : 'text-neutral-700 hover:text-[#15803d]'
              }`}
            >
              {category}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onSearchClick}
            className={iconButton}
            aria-label="Buscar productos"
            title="Buscar productos"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="hidden sm:flex h-10 items-center gap-2 rounded-full bg-white border border-neutral-200 px-3 text-neutral-800 hover:bg-neutral-50 transition-colors"
            aria-label="Compartir"
            title="Compartir"
          >
            <Share2 className="w-4 h-4" />
            <span className="text-[13px]">{shareLabel}</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            className={`sm:hidden ${iconButton}`}
            aria-label="Compartir"
            title="Compartir"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex h-10 w-10 rounded-full bg-[#25D366] text-white items-center justify-center hover:bg-[#20BA5A] transition-colors"
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
            <ShoppingBag className="w-4 h-4" />
            {cartItemsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-[#15803d] text-white text-xs font-semibold flex items-center justify-center rounded-full">
                {cartItemsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
