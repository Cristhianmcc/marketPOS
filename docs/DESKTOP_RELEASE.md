# Instalador y Auto-Update (D7)

## Resumen

El módulo D7 proporciona:
- ✅ Instalador NSIS profesional para Windows
- ✅ Auto-update via GitHub Releases o servidor privado
- ✅ Preflight checks (PostgreSQL, migraciones)
- ✅ API para gestionar actualizaciones desde la UI

---

## Instalador (NSIS)

### Características
- Instalación con progreso visual
- Permite elegir directorio de instalación
- Crea accesos directos (escritorio + menú inicio)
- Ejecuta app automáticamente después de instalar
- Desinstalador incluido

### Configuración (package.json)

```json
{
  "build": {
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "MarketPOS",
      "installerIcon": "../public/icons/icon-512.png",
      "runAfterFinish": true,
      "perMachine": false
    }
  }
}
```

---

## Auto-Update

### Providers Soportados

#### GitHub Releases (Recomendado)

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-org",
      "repo": "marketpos-desktop",
      "releaseType": "release"
    }
  }
}
```

#### Servidor Privado

```typescript
// En la app, configurar servidor personalizado
await window.desktop.updater.updateConfig({
  feedUrl: 'https://updates.tu-empresa.com/marketpos'
});
```

El servidor debe servir un archivo `latest.yml`:

```yaml
version: 1.2.0
files:
  - url: MarketPOS-Setup-1.2.0.exe
    sha512: <hash>
    size: 85000000
path: MarketPOS-Setup-1.2.0.exe
sha512: <hash>
releaseDate: '2026-02-13T10:00:00.000Z'
```

---

## API Desktop

### Verificar Actualizaciones

```typescript
// Con diálogo de confirmación
const status = await window.desktop.updater.checkForUpdates();

// Silencioso (background)
const status = await window.desktop.updater.checkSilent();
```

### Estado de Actualización

```typescript
interface UpdateStatus {
  checking: boolean;      // Verificando...
  available: boolean;     // Hay update disponible
  downloaded: boolean;    // Update descargado
  downloading: boolean;   // Descargando...
  progress: number;       // Progreso 0-100
  version: string | null; // Nueva versión
  error: string | null;   // Error si hubo
}

const status = await window.desktop.updater.getStatus();
```

### Descargar e Instalar

```typescript
// Descargar update
await window.desktop.updater.download();

// Instalar (cierra y reinicia la app)
window.desktop.updater.install();
```

### Configuración

```typescript
interface UpdateConfig {
  autoDownload: boolean;       // Auto-descargar updates
  autoInstallOnQuit: boolean;  // Instalar al cerrar
  checkInterval: number;       // Minutos entre checks
  feedUrl?: string;            // URL servidor custom
}

// Leer config
const config = await window.desktop.updater.getConfig();

// Actualizar
await window.desktop.updater.updateConfig({
  autoDownload: false,
  checkInterval: 120 // cada 2 horas
});
```

### Eventos

```typescript
// Escuchar cambios de estado
window.desktop.on('updater:status', (status: UpdateStatus) => {
  if (status.available) {
    console.log('Nueva versión:', status.version);
  }
  if (status.downloaded) {
    console.log('Listo para instalar');
  }
});
```

---

## Preflight Checks

Al iniciar en modo producción, se ejecutan verificaciones automáticas:

| Check | Crítico | Descripción |
|-------|---------|-------------|
| PostgreSQL | ✅ | Puerto 5432 activo |
| Base de Datos | ⚠️ | `marketpos_desktop` existe |
| Migraciones | ⚠️ | Prisma migrations presentes |
| Archivos Servidor | ✅ | `server.js` existe |
| Puerto 3001 | ⚠️ | Disponible para servidor |

Si un check crítico falla, la app no inicia.
Si hay warnings, se muestra diálogo con opción de continuar.

---

## Flujo de Release

### 1. Actualizar Versión

```bash
cd desktop
npm version patch  # 0.1.0 -> 0.1.1
# o
npm version minor  # 0.1.1 -> 0.2.0
# o
npm version major  # 0.2.0 -> 1.0.0
```

### 2. Build del Instalador

```bash
# Primero, build del Next.js standalone
cd ..
npm run build

# Luego, build del instalador
cd desktop
npm run build
```

Output: `desktop/dist-electron/MarketPOS-Setup-X.X.X.exe`

### 3. Publicar Release

#### GitHub Releases

```bash
# Con gh cli
gh release create v1.0.0 \
  ./dist-electron/MarketPOS-Setup-1.0.0.exe \
  --title "MarketPOS v1.0.0" \
  --notes "Descripción del release"
```

O manualmente en GitHub:
1. Ir a Releases > Draft new release
2. Tag: `v1.0.0`
3. Upload: `MarketPOS-Setup-1.0.0.exe`
4. Publish

#### Servidor Privado

```bash
# Copiar archivos al servidor
scp ./dist-electron/MarketPOS-Setup-1.0.0.exe user@server:/updates/
scp ./dist-electron/latest.yml user@server:/updates/
```

### 4. Verificar Update

En una instalación existente:
1. Abrir MarketPOS
2. Ir a Configuración > Actualizaciones
3. Click "Buscar Actualizaciones"
4. Debería detectar la nueva versión

---

## UI: Componente de Actualizaciones

```tsx
// components/settings/UpdateSettings.tsx
'use client';

import { useEffect, useState } from 'react';

export function UpdateSettings() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [config, setConfig] = useState<UpdateConfig | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!window.desktop?.updater) return;
    
    loadStatus();
    loadConfig();
    
    // Escuchar cambios
    window.desktop.on('updater:status', setStatus);
    
    return () => {
      window.desktop.off('updater:status', setStatus);
    };
  }, []);

  const loadStatus = async () => {
    const s = await window.desktop.updater.getStatus();
    setStatus(s);
  };

  const loadConfig = async () => {
    const c = await window.desktop.updater.getConfig();
    setConfig(c);
  };

  const handleCheck = async () => {
    setChecking(true);
    await window.desktop.updater.checkForUpdates();
    setChecking(false);
  };

  const handleInstall = () => {
    window.desktop.updater.install();
  };

  if (!window.desktop?.updater) {
    return <p>Solo disponible en app desktop</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3>Versión Actual</h3>
          <p className="text-gray-500">{status?.version || 'Cargando...'}</p>
        </div>
        
        <button 
          onClick={handleCheck}
          disabled={checking || status?.checking}
        >
          {checking ? 'Buscando...' : 'Buscar Actualizaciones'}
        </button>
      </div>

      {status?.available && !status.downloaded && (
        <div className="bg-blue-50 p-4 rounded">
          <p>Nueva versión disponible: {status.version}</p>
          {status.downloading ? (
            <div className="mt-2">
              <div className="bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${status.progress}%` }}
                />
              </div>
              <p className="text-sm mt-1">{status.progress.toFixed(0)}%</p>
            </div>
          ) : (
            <button onClick={() => window.desktop.updater.download()}>
              Descargar
            </button>
          )}
        </div>
      )}

      {status?.downloaded && (
        <div className="bg-green-50 p-4 rounded">
          <p>Actualización lista para instalar</p>
          <button 
            onClick={handleInstall}
            className="bg-green-600 text-white px-4 py-2 rounded mt-2"
          >
            Reiniciar e Instalar
          </button>
        </div>
      )}

      <div className="border-t pt-4">
        <h4>Configuración</h4>
        <label className="flex items-center gap-2 mt-2">
          <input 
            type="checkbox"
            checked={config?.autoDownload}
            onChange={(e) => {
              window.desktop.updater.updateConfig({ 
                autoDownload: e.target.checked 
              });
              loadConfig();
            }}
          />
          Descargar actualizaciones automáticamente
        </label>
      </div>
    </div>
  );
}
```

---

## Troubleshooting

### "Error: spawn UNKNOWN"
PostgreSQL no está instalado o no inició. Instalar PostgreSQL 16+ y asegurar que el servicio esté corriendo.

### "No se encontraron actualizaciones"
1. Verificar que el tag de GitHub coincide (`vX.X.X`)
2. Verificar que el release no es draft
3. Check `publish.provider` en package.json

### "Error de firma" (Windows)
En desarrollo no firmamos el exe. Para producción, configurar:
```json
{
  "win": {
    "signAndEditExecutable": true,
    "certificateFile": "./cert.pfx",
    "certificatePassword": "xxx"
  }
}
```

---

## Archivos Relacionados

| Archivo | Propósito |
|---------|-----------|
| [desktop/src/updater/autoUpdater.ts](../desktop/src/updater/autoUpdater.ts) | Auto-update manager |
| [desktop/src/updater/preflight.ts](../desktop/src/updater/preflight.ts) | Preflight checks |
| [desktop/package.json](../desktop/package.json) | Build config NSIS |
| [desktop/src/main.ts](../desktop/src/main.ts) | Integración |
| [desktop/src/preload.ts](../desktop/src/preload.ts) | API expuesta |
