# MarketPOS Desktop - Guía de Desarrollo

## Arquitectura

```
/desktop                 # Aplicación Electron (separada de web)
├── src/
│   ├── main.ts         # Proceso principal
│   └── preload.ts      # Bridge seguro IPC
├── resources/
│   ├── loading.html    # Pantalla de carga
│   └── error.html      # Pantalla de error
├── dist/               # TypeScript compilado
├── dist-electron/      # Instaladores generados
├── package.json        # Dependencias propias
└── tsconfig.json       # Config TypeScript

/                       # Web (Next.js) - NO TOCAR desde desktop
├── src/
├── prisma/
└── ...
```

## Requisitos

- Node.js 18+
- npm 9+
- Windows 10+ / macOS 12+ / Ubuntu 20+

## Desarrollo

### 1. Instalar dependencias de desktop

```bash
cd desktop
npm install
```

### 2. Iniciar servidor web (en otra terminal)

```bash
# En la raíz del proyecto
npm run dev
```

### 3. Iniciar Electron en modo desarrollo

```bash
# En /desktop
npm run dev
```

Esto compila TypeScript en modo watch y abre Electron conectándose a `localhost:3000`.

## Build de Producción

### Pre-requisitos

1. Buildear la web primero:
```bash
# En raíz
npm run build
```

2. Generar instalador:
```bash
# En /desktop
npm run build
```

### Outputs

- **Windows:** `dist-electron/MarketPOS-Setup-0.1.0.exe`
- **macOS:** `dist-electron/MarketPOS-0.1.0.dmg`
- **Linux:** `dist-electron/MarketPOS-0.1.0.AppImage`

## Seguridad

La aplicación desktop implementa múltiples capas de seguridad:

### Configuración del BrowserWindow

```typescript
webPreferences: {
  contextIsolation: true,     // Aisla contexto de preload
  nodeIntegration: false,     // No expone Node.js al renderer
  sandbox: true,              // Proceso sandboxed
  webSecurity: true,          // Políticas de seguridad web activas
}
```

### Content Security Policy

```
default-src 'self' http://localhost:*;
script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*;
connect-src 'self' http://localhost:* https://*.amazonaws.com;
```

### IPC Seguro

El preload script expone una API mínima al renderer:

```typescript
// En el renderer (React/Next.js)
window.desktop.platform          // 'win32' | 'darwin' | 'linux'
window.desktop.isDesktop         // true
window.desktop.window.minimize() // Control de ventana
window.desktop.offline.getStatus() // Estado offline
```

**NO SE EXPONE:**
- `require()`
- `process`
- `fs`
- `child_process`
- Acceso directo a `ipcRenderer`

## Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo con hot-reload |
| `npm run build` | Build Windows |
| `npm run build:mac` | Build macOS |
| `npm run build:linux` | Build Linux |
| `npm run pack` | Build sin instalador (para testing) |
| `npm run clean` | Limpiar builds |

## Estructura de Módulos

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| D1 | ✅ | Electron Shell |
| D2 | ⏳ | Local Server |
| D3 | ⏳ | PostgreSQL Embebido |
| D4 | ⏳ | Modo Offline |
| D5 | ⏳ | Sync Cloud |

## Troubleshooting

### "Cannot find module 'electron'"

```bash
cd desktop
npm install
```

### Puerto en uso

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# macOS/Linux
lsof -i :3000
kill -9 <pid>
```

### TypeScript errors

```bash
cd desktop
npm run clean
npm run build
```

## Notas Importantes

1. **NO modificar código web desde /desktop** - Mantener separación de concerns
2. **NO usar `nodeIntegration: true`** - Riesgo de seguridad crítico
3. **Siempre usar contextBridge** - Para exponer APIs al renderer
4. **Testear en las 3 plataformas** - Antes de release
