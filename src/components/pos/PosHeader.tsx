// src/components/pos/PosHeader.tsx
// Cabecera del POS: saludo y aviso de turno cerrado
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface PosHeaderProps {
  shiftOpen: boolean;
  onOpenShift: () => void;
  /** Acciones extra a la derecha (p. ej. accesos de superadmin) */
  actions?: ReactNode;
}

export function PosHeader({ shiftOpen, onOpenShift, actions }: PosHeaderProps) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const full: string | undefined = data?.user?.name;
        if (full) setName(full.trim());
      })
      .catch(() => {});
  }, []);

  const firstName = name?.split(/\s+/)[0];

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-extrabold tracking-tight text-text-main dark:text-text-light">
        Hola{firstName ? `, ${firstName}` : ''}
      </h1>

      <div className="flex items-center gap-3">
        {!shiftOpen && (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-light dark:bg-surface-dark shadow-soft pl-3 pr-1.5 py-1.5">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-text-main dark:text-text-light">Abre un turno para vender</span>
            <button
              onClick={onOpenShift}
              className="h-9 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
            >
              Abrir turno
            </button>
          </div>
        )}
        {actions}
        {name && (
          <div
            title={name}
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ffb347] to-[#ff7a1a] text-white font-bold text-lg flex items-center justify-center shadow-soft"
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}
