import { Facebook, Instagram } from 'lucide-react';
import type { PublicCatalogStore } from '@/types/catalog';
import { TikTokIcon, WhatsAppIcon } from './catalogIcons';

const STEPS = [
  'Elige tus productos y agrégalos al carrito.',
  'Revisa tu pedido y el total.',
  'Envíanos el pedido por WhatsApp.',
];

const socialLink =
  'flex h-10 items-center gap-2 rounded-full px-4 text-sm text-white transition-colors';

export function CatalogFooter({ store }: { store: PublicCatalogStore }) {
  const whatsapp = store.whatsappNumber;
  const { facebookUrl, instagramUrl, tiktokUrl } = store;
  const hasContact = Boolean(whatsapp || facebookUrl || instagramUrl || tiktokUrl);

  return (
    <footer className="mt-4 rounded-t-3xl bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-bold text-[var(--cat-ink)]">Cómo pedir</h2>
          <ol className="space-y-2 text-sm text-neutral-700">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cat-soft)] text-xs font-bold text-[var(--cat-primary)]">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {hasContact && (
          <div>
            <h2 className="mb-3 text-sm font-bold text-[var(--cat-ink)]">Contáctanos</h2>
            <div className="flex flex-wrap gap-2">
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${socialLink} bg-[#25D366] hover:bg-[#20BA5A]`}
                >
                  <WhatsAppIcon />
                  WhatsApp
                </a>
              )}
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${socialLink} bg-[#1877F2] hover:bg-[#166FE5]`}
                >
                  <Facebook className="w-4 h-4" />
                  Facebook
                </a>
              )}
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${socialLink} bg-[#E4405F] hover:bg-[#D93654]`}
                >
                  <Instagram className="w-4 h-4" />
                  Instagram
                </a>
              )}
              {tiktokUrl && (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${socialLink} bg-black hover:bg-neutral-900`}
                >
                  <TikTokIcon />
                  TikTok
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-100 px-4 py-3 text-center text-xs text-neutral-500">
        {store.name || 'Catálogo'}
      </div>
    </footer>
  );
}
