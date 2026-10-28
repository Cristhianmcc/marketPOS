'use client';

import { useEffect } from 'react';

/**
 * ✅ MÓDULO S6: Componente para registrar el Service Worker
 * Se monta una sola vez en el layout principal
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // En modo desktop (Electron) no registrar el SW — causa conflictos con la CSP local
      const isElectron =
        navigator.userAgent.toLowerCase().includes('electron') ||
        typeof (window as unknown as Record<string, unknown>).desktopAPI !== 'undefined';
      if (isElectron) {
        // Desregistrar SWs cacheados de sesiones anteriores
        navigator.serviceWorker.getRegistrations().then(regs => {
          regs.forEach(r => r.unregister());
        });
        return;
      }

      // En desarrollo no usar SW: cachea /_next/static con nombres fijos y mezcla
      // chunks viejos con nuevos ("Cannot read properties of undefined (reading 'call')").
      if (process.env.NODE_ENV !== 'production') {
        const wasControlled = !!navigator.serviceWorker.controller;
        Promise.all([
          navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))),
          'caches' in window
            ? caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bodegapos-')).map(k => caches.delete(k))))
            : Promise.resolve(),
        ]).then(() => {
          // Una sola recarga para salir del control del SW antiguo
          if (wasControlled && !sessionStorage.getItem('sw-dev-cleared')) {
            sessionStorage.setItem('sw-dev-cleared', '1');
            window.location.reload();
          }
        });
        return;
      }

      // Registrar SW después de que la página cargue
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker registrado:', registration.scope);
            
            // Verificar actualizaciones periódicamente
            setInterval(() => {
              registration.update();
            }, 60 * 60 * 1000); // Cada hora
          })
          .catch((error) => {
            console.error('[PWA] Error registrando Service Worker:', error);
          });
      });
    }
  }, []);

  return null;
}
