// src/components/pos/PosHeader.tsx
// Cabecera del POS: banner Monterrial con saludo, fecha y estado del turno
'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface PosHeaderProps {
  shiftOpen: boolean;
  openingCashLabel?: string;
  onOpenShift: () => void;
}

export function PosHeader({ shiftOpen, openingCashLabel, onOpenShift }: PosHeaderProps) {
  const [firstName, setFirstName] = useState<string | null>(null);
  const [today, setToday] = useState('');

  useEffect(() => {
    // Fecha calculada en cliente para evitar diferencias de hidratación
    setToday(new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }));
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const name: string | undefined = data?.user?.name;
        if (name) setFirstName(name.trim().split(/\s+/)[0]);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="relative mb-4 overflow-hidden rounded-3xl bg-monterrial-forest text-monterrial-cream shadow-medium">
      {/* Montañas decorativas */}
      <svg
        className="absolute right-0 bottom-0 h-full w-1/2 max-w-md opacity-90 pointer-events-none"
        viewBox="0 0 400 160"
        preserveAspectRatio="xMaxYMax meet"
        aria-hidden="true"
      >
        <path d="M120 160 L230 40 L280 95 L310 65 L400 160 Z" fill="#16856B" opacity="0.6" />
        <path d="M170 160 L260 70 L300 110 L330 85 L400 150 L400 160 Z" fill="#f3f1ec" opacity="0.92" />
        <path d="M260 70 L245 92 L262 86 L272 100 Z" fill="#D9B66F" />
      </svg>

      <div className="relative flex flex-wrap items-start justify-between gap-3 px-6 py-5 md:px-8">
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-monterrial-gold px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-monterrial-forest">
            Monterrial POS
          </span>
          <h1 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">
            Hola{firstName ? ', ' : ''}<span className="text-monterrial-gold">{firstName}</span>
          </h1>
          <p className="mt-1 text-sm text-monterrial-cream/75">
            {today && <span className="capitalize">{today}</span>}
            <span className="hidden sm:inline"> · Vende rápido, factura sin líos</span>
          </p>
        </div>

        {shiftOpen ? (
          <div className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-4 py-2">
            <span className="w-2 h-2 rounded-full bg-monterrial-gold animate-pulse" />
            <span className="text-sm font-semibold">Turno abierto</span>
            {openingCashLabel && (
              <span className="text-sm text-monterrial-cream/75">· Caja inicial {openingCashLabel}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur pl-4 pr-2 py-2">
            <AlertCircle className="w-5 h-5 text-monterrial-gold flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Debes abrir turno para vender</p>
              <p className="text-monterrial-cream/70">Las ventas requieren un turno activo</p>
            </div>
            <button
              onClick={onOpenShift}
              className="ml-2 h-10 px-4 rounded-xl bg-monterrial-gold hover:bg-monterrial-gold-light text-monterrial-forest text-sm font-bold transition-colors"
            >
              Abrir Turno
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
