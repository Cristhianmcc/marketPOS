// src/components/pos/PosBanner.tsx
// Banner del POS. Por ahora muestra el banner de Monterrial; se puede ocultar.
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const HIDDEN_KEY = 'posBannerHidden';

export function PosBanner() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === 'true');
    } catch {
      setHidden(false);
    }
  }, []);

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_KEY, 'true');
    } catch {}
  };

  if (hidden) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-monterrial-forest text-monterrial-cream shadow-medium">
      {/* Montañas decorativas */}
      <svg
        className="absolute right-0 bottom-0 h-full w-2/3 max-w-md opacity-90"
        viewBox="0 0 400 160"
        preserveAspectRatio="xMaxYMax meet"
        aria-hidden="true"
      >
        <path d="M120 160 L230 40 L280 95 L310 65 L400 160 Z" fill="#16856B" opacity="0.55" />
        <path d="M170 160 L260 70 L300 110 L330 85 L400 150 L400 160 Z" fill="#f3f1ec" opacity="0.92" />
        <path d="M260 70 L245 92 L262 86 L272 100 Z" fill="#D9B66F" />
      </svg>
      <div className="relative px-6 py-6 md:px-8 md:py-7 max-w-[60%]">
        <span className="inline-block rounded-full bg-monterrial-gold px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-monterrial-forest">
          Monterrial POS
        </span>
        <h2 className="mt-3 text-2xl md:text-3xl font-extrabold leading-tight">
          Vende rápido, <span className="text-monterrial-gold">factura sin líos</span>
        </h2>
        <p className="mt-1 text-sm text-monterrial-cream/75">
          Boletas y facturas electrónicas SUNAT desde tu caja.
        </p>
      </div>
      <button
        onClick={hide}
        title="Ocultar banner"
        aria-label="Ocultar banner"
        className="absolute top-3 right-3 p-1.5 rounded-lg text-monterrial-cream/70 hover:bg-white/10 hover:text-monterrial-cream transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
