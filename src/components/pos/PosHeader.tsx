// src/components/pos/PosHeader.tsx
// Cabecera del POS: saludo al usuario, fecha y estado del turno
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-main dark:text-text-light">
          Hola{firstName ? `, ${firstName}` : ''}
        </h1>
        {today && (
          <p className="text-sm capitalize text-text-secondary dark:text-gray-400">{today}</p>
        )}
      </div>

      {shiftOpen ? (
        <div className="flex items-center gap-2 rounded-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 shadow-soft">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-semibold text-text-main dark:text-text-light">Turno abierto</span>
          {openingCashLabel && (
            <span className="text-sm text-text-secondary dark:text-gray-400">· Caja inicial {openingCashLabel}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-monterrial-gold/15 border border-monterrial-gold/40 pl-4 pr-2 py-2">
          <AlertCircle className="w-5 h-5 text-[#8a6d2c] dark:text-monterrial-gold flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-text-main dark:text-text-light">Debes abrir turno para vender</p>
            <p className="text-text-secondary dark:text-gray-400">Las ventas requieren un turno activo</p>
          </div>
          <button
            onClick={onOpenShift}
            className="ml-2 h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
          >
            Abrir Turno
          </button>
        </div>
      )}
    </div>
  );
}
