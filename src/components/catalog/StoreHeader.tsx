'use client';

import { useState } from 'react';
import { Facebook, Instagram, Share2, ShoppingBag } from 'lucide-react';
import type { PublicCatalogStore } from '@/types/catalog';

interface StoreHeaderProps {
  store: PublicCatalogStore;
  cartItemsCount: number;
  onCartClick: () => void;
}

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="currentColor">
    <path d="M16.6 3c1.2 1.2 2.7 1.9 4.4 2.1v2.5c-1.6-.1-3.1-.6-4.4-1.5v7.4c0 3-2.5 5.5-5.5 5.5S5.6 16.9 5.6 13.9s2.5-5.5 5.5-5.5c.4 0 .8 0 1.2.1v2.6c-.4-.2-.8-.3-1.2-.3-1.5 0-2.6 1.2-2.6 2.6s1.2 2.6 2.6 2.6 2.6-1.2 2.6-2.6V3h2.9z" />
  </svg>
);

export function StoreHeader({ store, cartItemsCount, onCartClick }: StoreHeaderProps) {
  const whatsapp = store.whatsappNumber;
  const facebook = store.facebookUrl || undefined;
  const instagram = store.instagramUrl || undefined;
  const tiktok = store.tiktokUrl || undefined;
  const [shareLabel, setShareLabel] = useState('Compartir');

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

  const WhatsAppIcon = () => (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="w-4 h-4"
      fill="currentColor"
    >
      <path d="M16.04 3.5c-6.9 0-12.5 5.52-12.5 12.32 0 2.17.58 4.3 1.69 6.16L3.5 28.5l6.73-1.77a12.6 12.6 0 0 0 5.81 1.46h.01c6.9 0 12.5-5.52 12.5-12.32 0-6.8-5.6-12.37-12.51-12.37Zm7.27 17.54c-.3.83-1.74 1.6-2.4 1.68-.6.08-1.36.11-2.19-.13-.5-.16-1.15-.38-1.98-.74-3.49-1.47-5.76-4.89-5.93-5.12-.16-.23-1.41-1.82-1.41-3.47 0-1.65.9-2.46 1.22-2.8.32-.34.7-.43.94-.43.24 0 .47 0 .68.01.22.01.5-.08.78.58.3.7 1.02 2.4 1.11 2.57.1.18.17.39.05.63-.11.24-.18.39-.35.6-.17.2-.37.45-.53.6-.17.16-.34.33-.15.64.2.31.9 1.43 1.93 2.32 1.32 1.15 2.43 1.5 2.78 1.67.35.17.55.14.76-.08.2-.23.88-1 1.11-1.34.23-.34.47-.28.79-.17.32.12 2.03.94 2.37 1.1.34.16.57.24.65.37.08.12.08.75-.21 1.58Z" />
    </svg>
  );

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
    <>
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-[#f7f6f2]/95 backdrop-blur">
        <div className="px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {store.logoUrl ? (
                <img
                  src={store.logoUrl}
                  alt={store.name}
                  className="h-10 w-10 rounded-full object-cover border border-neutral-200 bg-white shadow-sm"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-700 shadow-sm">
                  {store.name ? store.name.slice(0, 1).toUpperCase() : 'M'}
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-base tracking-tight truncate">
                    {store.name || 'Catálogo'}
                  </h1>
                  <span className="hidden sm:inline-flex shrink-0 rounded-full bg-white border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600">
                    Catálogo público
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-neutral-600 min-w-0">
                  <span className="truncate">@{store.slug}</span>
                  {updatedLabel ? <span className="text-neutral-300">·</span> : null}
                  {updatedLabel ? <span>Actualizado {updatedLabel}</span> : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleShare}
                className="hidden sm:flex h-9 items-center gap-2 rounded-full bg-white border border-neutral-200 px-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                aria-label="Compartir"
                title="Compartir"
              >
                <Share2 className="w-4 h-4" />
                <span className="text-[13px]">{shareLabel}</span>
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="sm:hidden h-9 w-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition-colors"
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
                  className="h-9 w-9 rounded-full bg-[#25D366] text-white border border-[#25D366] flex items-center justify-center hover:bg-[#20BA5A] transition-colors"
                  aria-label="WhatsApp"
                >
                  <WhatsAppIcon />
                </a>
              ) : (
                <span
                  className="h-9 w-9 rounded-full bg-white/60 text-neutral-400 border border-neutral-200 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <WhatsAppIcon />
                </span>
              )}

              {facebook ? (
                <a
                  href={facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-[#1877F2]/15 text-[#1877F2] border border-[#1877F2]/30 flex items-center justify-center hover:bg-[#1877F2] hover:text-white transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="w-4 h-4" />
                </a>
              ) : (
                <span
                  className="h-9 w-9 rounded-full bg-white/60 text-neutral-400 border border-neutral-200 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <Facebook className="w-4 h-4" />
                </span>
              )}

              {instagram ? (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-[#E4405F]/15 text-[#E4405F] border border-[#E4405F]/30 flex items-center justify-center hover:bg-[#E4405F] hover:text-white transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="w-4 h-4" />
                </a>
              ) : (
                <span
                  className="h-9 w-9 rounded-full bg-white/60 text-neutral-400 border border-neutral-200 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <Instagram className="w-4 h-4" />
                </span>
              )}

              {tiktok ? (
                <a
                  href={tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-black/10 text-black border border-black/20 flex items-center justify-center hover:bg-black hover:text-white transition-colors"
                  aria-label="TikTok"
                >
                  <TikTokIcon />
                </a>
              ) : (
                <span
                  className="h-9 w-9 rounded-full bg-white/60 text-neutral-400 border border-neutral-200 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <TikTokIcon />
                </span>
              )}

              <button
                onClick={onCartClick}
                className="p-2 hover:bg-black/5 rounded-lg transition-colors relative"
                aria-label="Carrito"
              >
                <ShoppingBag className="w-5 h-5" />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-black text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                    {cartItemsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {store.bannerUrl ? (
        <div className="bg-white border-b border-neutral-200">
          <img
            src={store.bannerUrl}
            alt={store.name}
            className="w-full aspect-[5/1] object-cover"
          />
        </div>
      ) : (
        <div className="bg-white px-4 py-3 border-b border-neutral-200">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-xl mb-1">Encuentra todo lo que necesitas</h2>
            <p className="text-xs text-neutral-600">
              Productos de calidad para tu hogar y negocio
            </p>
          </div>
        </div>
      )}
    </>
  );
}

