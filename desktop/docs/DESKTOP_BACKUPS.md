# 💾 MÓDULO D4 — BACKUP OFFLINE AUTOMÁTICO + RESTORE LOCAL

**Estado:** ✅ Completado  
**Fecha:** Febrero 2026

---

## 📌 Resumen

El módulo D4 permite que la aplicación Desktop sobreviva a apagones o daños de PC mediante:

- **Backups automáticos** en formato ZIP con checksum SHA-256 (OBLIGATORIO)
- **Restauración segura** como nueva tienda ARCHIVED
- **Retención configurable** de backups antiguos

---

## 🏗 Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      BackupScheduler                           │
│                    (backupScheduler.ts)                         │
├─────────────────────────────────────────────────────────────────┤
│  Triggers:                                                      │
│    ├── manual        → Usuario solicita backup                  │
│    ├── shift-close   → Al cerrar turno (si habilitado)         │
│    └── scheduled     → Cada X horas (configurable)             │
├─────────────────────────────────────────────────────────────────┤
│  Acciones:                                                      │
│    ├── createBackup()  → ZIP con checksum SHA-256              │
│    ├── restoreBackup() → Valida checksum + envía a API         │
│    └── listBackups()   → Lista archivos en carpeta             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura de Backups

### Ruta por Defecto (Windows)

```
%USERPROFILE%/Documents/MarketPOS/Backups/{storeName}/
  ├── backup_2026-02-13_10-30-00.zip
  ├── backup_2026-02-13_16-45-22.zip
  └── backup_2026-02-14_08-00-00.zip
```

### Contenido del ZIP

```
backup_YYYY-MM-DD_HH-mm-ss.zip
  ├── metadata.json   # Info del backup + checksum
  └── data.json       # Datos exportados
```

### metadata.json

```json
{
  "version": "1.0",
  "exportedAt": "2026-02-13T10:30:00.000Z",
  "appVersion": "1.0.0",
  "store": {
    "name": "Mi Tienda",
    "ruc": "20123456789",
    "address": "Av. Principal 123"
  },
  "checksum": "sha256:a1b2c3d4e5f6...",
  "counts": {
    "products": 150,
    "sales": 1230,
    "users": 5
  },
  "trigger": "scheduled"
}
```

---

## 🔧 Configuración

### BackupConfig

```typescript
interface BackupConfig {
  enabled: boolean;           // Habilitar backups automáticos
  intervalHours: number;      // Intervalo (0 = solo manual)
  onShiftClose: boolean;      // Backup al cerrar turno
  maxBackups: number;         // Retención (0 = ilimitado)
  customPath?: string;        // Ruta personalizada
}
```

### Valores por Defecto

```typescript
{
  enabled: true,
  intervalHours: 24,      // Diario
  onShiftClose: true,
  maxBackups: 30,         // Últimos 30 backups
}
```

---

## 🚀 API Frontend

### window.desktop.backup

```typescript
// Crear backup manual
const result = await window.desktop.backup.create(
  { id: 'store-id', name: 'Mi Tienda' },
  'manual'
);
// { success: true, filePath: '...', fileName: '...', size: 12345 }

// Listar backups de una tienda
const backups = await window.desktop.backup.list('Mi Tienda');
// [{ fileName, filePath, size, createdAt }]

// Restaurar backup
const restore = await window.desktop.backup.restore('/path/to/backup.zip');
// { success: true, metadata: {...} }

// Obtener/actualizar configuración
const config = await window.desktop.backup.getConfig();
await window.desktop.backup.updateConfig({ intervalHours: 12 });

// Abrir carpeta de backups
await window.desktop.backup.openBackupFolder('Mi Tienda');

// Seleccionar carpeta personalizada (dialog)
const folder = await window.desktop.backup.pickFolder();
// '/ruta/seleccionada' o null si canceló
```

---

## 🔌 IPC Handlers

| Handler | Descripción |
|---------|-------------|
| `backup:create` | Crear backup (storeInfo, trigger) |
| `backup:list` | Listar backups de tienda |
| `backup:restore` | Restaurar desde archivo |
| `backup:get-config` | Obtener configuración |
| `backup:update-config` | Actualizar configuración |
| `backup:get-dir` | Obtener ruta de backups |
| `backup:open-folder` | Abrir carpeta en explorador |
| `backup:pick-folder` | Selector de carpeta personalizada |

---

## 🔒 Seguridad

### Checksum SHA-256 (OBLIGATORIO)

Todos los backups modernos incluyen checksum SHA-256:

```javascript
// Al crear backup
const dataContent = JSON.stringify(data, null, 2);
const checksum = crypto.createHash('sha256')
  .update(dataContent, 'utf8')
  .digest('hex');
metadata.checksum = `sha256:${checksum}`;

// Al restaurar
const actualChecksum = crypto.createHash('sha256')
  .update(dataContent, 'utf8')
  .digest('hex');

if (metadata.checksum !== `sha256:${actualChecksum}`) {
  throw new Error('INVALID_BACKUP_CHECKSUM');
}
```

### Backups Legacy (sin checksum)

- Solo SUPERADMIN puede restaurar backups legacy
- Requiere flag `allowLegacy: true` explícito
- Se loguea advertencia en auditoría

---

## 🔄 Restore Flow

### Endpoint: `/api/backups/restore/new-store`

Solo SUPERADMIN puede usar este endpoint.

**Proceso:**

1. Validar checksum SHA-256
2. Crear tienda como **ARCHIVED** con nombre:
   ```
   "{storeName} (Restaurado DD/MM/YYYY)"
   ```
3. Crear owner con password temporal
4. Retornar credenciales

**Respuesta:**

```json
{
  "success": true,
  "store": {
    "id": "new-store-id",
    "name": "Mi Tienda (Restaurado 13/02/2026)",
    "status": "ARCHIVED"
  },
  "owner": {
    "email": "owner@tienda.com",
    "tempPassword": "TempXyz123!"
  }
}
```

### Reactivación

1. SUPERADMIN cambia status de ARCHIVED a ACTIVE
2. Owner inicia sesión con password temporal
3. Owner cambia password

---

## 🧪 Testing Manual

### Checklist

| Test | Pasos | Esperado |
|------|-------|----------|
| Backup manual | Settings > Backups > "Backup ahora" | ZIP en Documents/MarketPOS/Backups |
| Checksum inválido | Editar data.json dentro del ZIP | Error: "Checksum inválido" |
| Restore válido | Upload ZIP a restore endpoint | Tienda ARCHIVED creada |
| Reactivar tienda | Cambiar status a ACTIVE | Login funciona |
| Shift close | Cerrar turno con `onShiftClose: true` | Backup automático |
| Retención | Crear >30 backups | Más antiguos eliminados |
| No rompe web | Usar export/restore en web cloud | Funciona igual |

### Comandos de Verificación

```javascript
// Verificar config
const config = await window.desktop.backup.getConfig();
console.log(config);

// Listar backups
const backups = await window.desktop.backup.list('Mi Tienda');
console.log(backups);

// Crear backup manual
const result = await window.desktop.backup.create(
  { id: 'store-id', name: 'Mi Tienda' },
  'manual'
);
console.log(result);
```

---

## 📊 Eventos IPC

El módulo emite eventos para tracking de progreso:

| Evento | Datos |
|--------|-------|
| `backup:progress` | `{ percent, stage }` |
| `backup:completed` | `{ fileName, size }` |
| `backup:error` | `{ error }` |

---

## 🐛 Troubleshooting

### Backup no se guarda

1. Verificar permisos de escritura en Documents
2. Verificar espacio en disco
3. Revisar logs en consola Electron

### Checksum inválido al restaurar

1. No modificar archivos dentro del ZIP
2. Descargar backup nuevamente
3. Verificar que no haya corrupción de red

### Scheduler no ejecuta

1. Verificar `config.enabled = true`
2. Verificar `config.intervalHours > 0`
3. Reiniciar aplicación

---

## ✅ Checklist D4

- [x] BackupScheduler con SHA-256 checksum
- [x] Backup automático (scheduler + shift-close)
- [x] Retención configurable (maxBackups)
- [x] Ruta personalizable (customPath)
- [x] IPC handlers completos
- [x] Preload API (window.desktop.backup.*)
- [x] Selector de carpeta (pickFolder)
- [x] API restore/new-store (ARCHIVED + owner temp)
- [x] UI Settings > Backups
- [x] TypeScript compila sin errores
- [x] Documentación completa
