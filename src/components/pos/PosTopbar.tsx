'use client';

import { Store, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PosTopbarProps {
  shiftStatus: 'open' | 'closed';
  shiftOpenedAt?: Date;
  cashierName?: string;
  cashierRole?: 'owner' | 'admin' | 'cashier';
}

export function PosTopbar({ shiftStatus, shiftOpenedAt, cashierName = 'Usuario', cashierRole = 'cashier' }: PosTopbarProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const displayRole = cashierRole === 'owner' ? 'Propietario' : cashierRole === 'admin' ? 'Administrador' : 'Cajero';

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatShiftTime = (date: Date) => {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark">
      {/* Left: Brand & Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20">
            <Store className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-main dark:text-white">BodegaPOS</h1>
            <p className="text-xs text-text-secondary dark:text-gray-400">Punto de venta</p>
          </div>
        </div>

        {/* Shift Status */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark">
          <div className={`w-2 h-2 rounded-full ${shiftStatus === 'open' ? 'bg-primary animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm font-semibold text-text-main dark:text-white">
            Caja {shiftStatus === 'open' ? 'Abierta' : 'Cerrada'}
          </span>
          {shiftStatus === 'open' && shiftOpenedAt && (
            <>
              <span className="text-text-secondary dark:text-gray-400">•</span>
              <Clock className="w-4 h-4 text-text-secondary dark:text-gray-400" />
              <span className="text-sm text-text-secondary dark:text-gray-400">
                {formatShiftTime(shiftOpenedAt)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: User Info & Clock */}
      <div className="flex items-center gap-4">
        {/* Current Time */}
        <div className="px-4 py-2 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark">
          <div className="text-right">
            <p className="text-lg font-bold text-text-main dark:text-white tabular-nums">
              {formatTime(currentTime)}
            </p>
            <p className="text-xs text-text-secondary dark:text-gray-400">
              {formatDate(currentTime)}
            </p>
          </div>
        </div>

        {/* User Info */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold text-text-main dark:text-white">{cashierName}</p>
            <p className="text-xs text-text-secondary dark:text-gray-400">{displayRole}</p>
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 dark:bg-primary/30 text-primary font-semibold text-sm">
            {cashierName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
}
