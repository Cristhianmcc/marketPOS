// src/components/pos/PosHeader.tsx
// Cabecera del POS: saludo, fecha y estado del turno
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface PosHeaderProps {
  shiftOpen: boolean;
  openingCashLabel?: string;
  onOpenShift: () => void;
  /** Acciones extra a la derecha (p. ej. accesos de superadmin) */
  actions?: ReactNode;
}

export function PosHeader({ shiftOpen, openingCashLabel, onOpenShift, actions }: PosHeaderProps) {
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
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-text-secondary dark:text-gray-400 first-letter:uppercase">{today || ' '}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-main dark:text-text-light">
          Hola{firstName ? `, ${firstName}` : ''}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {actions}
        {shiftOpen ? (
          <div className="flex items-center gap-2 h-9 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 text-sm">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="font-medium text-text-main dark:text-text-light">Turno abierto</span>
            {openingCashLabel && (
              <span className="text-text-secondary dark:text-gray-400">· Caja inicial {openingCashLabel}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50 pl-3 pr-1.5 py-1.5">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-900 dark:text-amber-200">Abre un turno para vender</span>
            <button
              onClick={onOpenShift}
              className="h-8 px-3 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
            >
              Abrir turno
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
