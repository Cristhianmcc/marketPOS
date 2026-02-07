'use client';

import { useEffect } from 'react';

/**
 * ✅ MÓDULO S6: Componente para registrar el Service Worker
 * Se monta una sola vez en el layout principal
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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
