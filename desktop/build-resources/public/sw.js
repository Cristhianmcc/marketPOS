// ✅ MÓDULO S6: Service Worker para BodegaPOS PWA
const CACHE_NAME = 'bodegapos-v1';
const STATIC_ASSETS = [
  '/',
  '/pos',
  '/inventory',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// Instalación: pre-cache de assets estáticos
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      // Cache lo que podamos, no fallar si alguno no existe
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => 
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to cache ${url}:`, err);
          })
        )
      );
    })
  );
  // Activar inmediatamente
  self.skipWaiting();
});

// Activación: limpiar caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Tomar control de todas las páginas
  self.clients.claim();
});

// Fetch: estrategia Network First con fallback a cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests que no sean GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignorar APIs - siempre ir a red (checkout, auth, etc.)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Ignorar requests de desarrollo
  if (url.pathname.includes('_next/webpack-hmr') || 
      url.pathname.includes('__nextjs') ||
      url.hostname === 'localhost' && url.port === '3001' && url.pathname.includes('_next/static/development')) {
    return;
  }

  // Para assets estáticos (_next/static): Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          // Clonar y guardar en cache
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Para páginas: Network First con fallback a cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Guardar respuesta exitosa en cache
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, intentar cache
        return caches.match(request).then((cached) => {
          if (cached) {
            return cached;
          }
          // Si no hay cache, devolver página offline
          return caches.match('/').then((fallback) => {
            if (fallback) {
              return fallback;
            }
            // Última opción: error genérico
            return new Response('Sin conexión', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' },
            });
          });
        });
      })
  );
});

// Mensaje para forzar actualización
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
