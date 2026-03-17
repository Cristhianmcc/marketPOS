import { Facebook, Instagram, MessageCircle } from 'lucide-react';

interface SocialLinksProps {
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
}

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="currentColor">
    <path d="M16.6 3c1.2 1.2 2.7 1.9 4.4 2.1v2.5c-1.6-.1-3.1-.6-4.4-1.5v7.4c0 3-2.5 5.5-5.5 5.5S5.6 16.9 5.6 13.9s2.5-5.5 5.5-5.5c.4 0 .8 0 1.2.1v2.6c-.4-.2-.8-.3-1.2-.3-1.5 0-2.6 1.2-2.6 2.6s1.2 2.6 2.6 2.6 2.6-1.2 2.6-2.6V3h2.9z" />
  </svg>
);

export function SocialLinks({ whatsapp, facebook, instagram, tiktok }: SocialLinksProps) {
  if (!whatsapp && !facebook && !instagram && !tiktok) return null;

  const cleanNumber = whatsapp ? whatsapp.replace(/[^\d]/g, '') : '';

  return (
    <div className="bg-white border-t border-neutral-200 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <h3 className="text-sm mb-4">Contáctanos</h3>
        <div className="flex flex-wrap gap-3">
          {whatsapp && (
            <a
              href={`https://wa.me/${cleanNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366] text-white rounded-xl hover:bg-[#20BA5A] transition-colors text-sm shadow-sm"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          )}

          {facebook && (
            <a
              href={facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1877F2] text-white rounded-xl hover:bg-[#166FE5] transition-colors text-sm shadow-sm"
            >
              <Facebook className="w-4 h-4" />
              Facebook
            </a>
          )}

          {instagram && (
            <a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#E4405F] text-white rounded-xl hover:bg-[#D93654] transition-colors text-sm shadow-sm"
            >
              <Instagram className="w-4 h-4" />
              Instagram
            </a>
          )}

          {tiktok && (
            <a
              href={tiktok}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-xl hover:bg-neutral-900 transition-colors text-sm shadow-sm"
            >
              <TikTokIcon />
              TikTok
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

