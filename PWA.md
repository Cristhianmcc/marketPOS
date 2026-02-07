# PWA.md — Progressive Web App + Offline Light

## 📋 Resumen

El sistema BodegaPOS es una **Progressive Web App (PWA)** que permite:
- Instalarse como app nativa en móviles y escritorio
- Funcionar parcialmente sin conexión (cache de assets)
- Mostrar banner cuando no hay internet
- Bloquear checkout si está offline (por seguridad)

## ⚙️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         PWA STACK                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐   ┌──────────────────┐                   │
│  │   manifest.json  │   │      sw.js       │                   │
│  │  (Web App Info)  │   │ (Service Worker) │                   │
│  └────────┬─────────┘   └────────┬─────────┘                   │
│           │                      │                              │
│           v                      v                              │
│  ┌──────────────────────────────────────────┐                  │
│  │            Next.js App                    │                  │
│  │  ┌────────────┐  ┌────────────────────┐  │                  │
│  │  │OfflineBanner│ │ServiceWorkerReg   │  │                  │
│  │  └────────────┘  └────────────────────┘  │                  │
│  │                                          │                  │
│  │  useOnlineStatus() → navigator.onLine   │                  │
│  └──────────────────────────────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Archivos

| Archivo | Descripción |
|---------|-------------|
| `public/manifest.json` | Metadatos de la PWA (nombre, iconos, colores) |
| `public/sw.js` | Service Worker para cache de assets |
| `public/icons/icon-192.svg` | Icono 192x192 para PWA |
| `public/icons/icon-512.svg` | Icono 512x512 para PWA |
| `src/hooks/useOnlineStatus.ts` | Hook para detectar conexión |
| `src/components/pwa/OfflineBanner.tsx` | Banner "Sin internet" |
| `src/components/pwa/ServiceWorkerRegistration.tsx` | Registro del SW |
| `src/app/layout.tsx` | Incluye manifest y componentes PWA |

## 🎯 Funcionalidades

### A) PWA Base
- **manifest.json**: Define nombre, iconos, colores, orientación
- **Service Worker**: Cache de CSS, JS, fonts, páginas principales
- **Iconos**: SVG escalables para cualquier dispositivo

### B) Offline Light
- **Detección**: `useOnlineStatus()` hook que escucha eventos online/offline
- **Banner**: Aparece cuando no hay conexión
- **Guard Checkout**: Bloquea ventas si está offline (prevención de errores)
- **Navegación**: POS e Inventory funcionan en solo-lectura si están en cache

## 🔧 Service Worker

### Estrategia de Cache

```
Tipo de Request     │ Estrategia
────────────────────┼──────────────────────────────
/_next/static/*     │ Cache First (assets estáticos)
/api/*              │ Network Only (nunca cache)
Páginas             │ Network First + Fallback a cache
```

### Cache Name
```js
const CACHE_NAME = 'bodegapos-v1';
```

Para forzar actualización, incrementar la versión.

## 🚫 Guard de Checkout Offline

Cuando el usuario intenta hacer checkout sin conexión:

1. **Pre-check**: Antes de abrir modal de pago
   ```ts
   if (!navigator.onLine) {
     toast.error('Sin conexión a internet');
     return;
   }
   ```

2. **Post-check**: En el catch del fetch
   ```ts
   if (!navigator.onLine) {
     toast.error('Sin conexión a internet', {
       description: 'No se pudo procesar la venta...'
     });
   }
   ```

## 📱 Instalación

### Android / Chrome
1. Abrir `https://tu-dominio.com/pos` en Chrome
2. Aparecerá banner "Añadir a pantalla inicio"
3. O menú ⋮ → "Instalar app"

### iOS / Safari
1. Abrir URL en Safari
2. Botón compartir → "Añadir a inicio"

### Desktop (Chrome/Edge)
1. Icono de instalación en barra de dirección
2. O menú → "Instalar BodegaPOS"

## 🧪 Testing

### Verificar PWA
1. Chrome DevTools → Application → Manifest
2. Verificar que aparecen todos los campos
3. Application → Service Workers → Verificar registro

### Probar Offline
1. Chrome DevTools → Network → Offline ✓
2. Navegar por la app → Debe aparecer banner
3. Intentar checkout → Debe bloquear con mensaje

### Lighthouse
1. Chrome DevTools → Lighthouse → PWA
2. Debe pasar todas las auditorías PWA

## ⚠️ Limitaciones

- **Checkout bloqueado**: Por seguridad, no se permite vender offline
- **APIs no cacheadas**: Datos de productos/inventario requieren conexión
- **Sin sync offline**: No hay cola de ventas pendientes (por diseño)

## 🔄 Actualización del Service Worker

Cuando se despliega una nueva versión:
1. Cambiar `CACHE_NAME` en sw.js (ej: `bodegapos-v2`)
2. SW se actualiza automáticamente en próxima visita
3. Cache antiguo se elimina automáticamente

## 📊 Eventos de Debug

En la consola del navegador:
```
[PWA] Service Worker registrado: /
[PWA] Pre-caching static assets
[PWA] Conexión restaurada
[PWA] Sin conexión
```
