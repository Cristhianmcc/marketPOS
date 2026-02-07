'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

/**
 * ✅ MÓDULO S6: Banner que aparece cuando no hay conexión
 * Se muestra fijo en la parte superior de la pantalla
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 shadow-md animate-slide-down">
      <WifiOff className="w-4 h-4" />
      <span className="text-sm font-medium">
        Sin conexión a internet — Algunas funciones no están disponibles
      </span>
    </div>
  );
}
