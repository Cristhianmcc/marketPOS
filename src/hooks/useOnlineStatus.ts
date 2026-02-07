'use client';

import { useState, useEffect } from 'react';

/**
 * ✅ MÓDULO S6: Hook para detectar estado de conexión
 * Retorna true si hay conexión, false si está offline
 */
export function useOnlineStatus(): boolean {
  // SSR safe: asumir online inicialmente
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Actualizar con el valor real del navegador
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      console.log('[PWA] Conexión restaurada');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[PWA] Sin conexión');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
