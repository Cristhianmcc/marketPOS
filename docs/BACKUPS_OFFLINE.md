# Backups Offline - Desktop

## Resumen

El módulo **D4 - Backup Local Automático** proporciona backups automáticos y manuales en la aplicación desktop, permitiendo:

- ✅ Backup automático al cerrar turno
- ✅ Backups programados (intervalo configurable)
- ✅ Almacenamiento local en Documents/MarketPOS/Backups/
- ✅ Restauración desde archivos locales
- ✅ Formato ZIP compatible con export/import web

---

## Arquitectura

```
desktop/src/
├── backupScheduler.ts    # Lógica de backups automáticos
├── main.ts               # IPC handlers registrados
└── preload.ts            # API expuesta a renderer

src/app/api/backups/
├── export/route.ts       # Export web (ZIP download)
└── restore/
    ├── new-store/        # Restore a nueva tienda
    └── local/route.ts    # Restore desde desktop
```

---

## Configuración

### BackupConfig

```typescript
interface BackupConfig {
  enabled: boolean;        // Backups habilitados
  intervalHours: number;   // Intervalo para backups automáticos (0 = deshabilitado)
  onShiftClose: boolean;   // Backup al cerrar turno
  maxBackups: number;      // Máximo de backups a retener
  customPath?: string;     // Ruta personalizada (opcional)
}
```

### Valores por Defecto

| Parámetro | Valor Default | Descripción |
|-----------|---------------|-------------|
| `enabled` | `true` | Backups activos |
| `intervalHours` | `24` | Backup diario |
| `onShiftClose` | `true` | Backup al cerrar turno |
| `maxBackups` | `30` | Últimos 30 backups |

---

## Ubicación de Backups

Los backups se guardan en:

```
Documents/
└── MarketPOS/
    └── Backups/
        └── {NombreTienda}/
            ├── backup_2024-01-15_10-30-45.zip
            ├── backup_2024-01-16_18-00-00.zip
            └── ...
```

### Estructura del ZIP

```
backup_YYYY-MM-DD_HH-mm-ss.zip
├── metadata.json    # Info del backup + checksum
└── data.json        # Datos completos de la tienda
```

---

## API Desktop (window.desktop.backup)

### Crear Backup Manual

```typescript
const result = await window.desktop.backup.create(
  { id: 'store-id', name: 'Mi Tienda', ruc: '12345678901' },
  'manual'
);

if (result.success) {
  console.log('Backup creado:', result.filePath);
  console.log('Tamaño:', result.size, 'bytes');
}
```

### Backup al Cerrar Turno

En el componente de cierre de turno:

```typescript
// Después de cerrar el turno exitosamente
if (window.desktop?.backup) {
  const config = await window.desktop.backup.getConfig();
  
  if (config.onShiftClose) {
    await window.desktop.backup.create(
      { id: store.id, name: store.name },
      'shift-close'
    );
  }
}
```

### Listar Backups

```typescript
const backups = await window.desktop.backup.list('Mi Tienda');

backups.forEach(backup => {
  console.log(backup.fileName, backup.size, backup.createdAt);
});
```

### Restaurar Backup

```typescript
const result = await window.desktop.backup.restore('/path/to/backup.zip');

if (result.success) {
  console.log('Restaurado desde:', result.metadata.exportedAt);
} else {
  console.error('Error:', result.error);
}
```

### Configuración

```typescript
// Obtener configuración actual
const config = await window.desktop.backup.getConfig();

// Actualizar configuración
await window.desktop.backup.updateConfig({
  intervalHours: 12,
  maxBackups: 60,
});
```

### Abrir Carpeta de Backups

```typescript
// Abre el explorador de archivos en la carpeta de backups
await window.desktop.backup.openBackupFolder('Mi Tienda');
```

---

## Integración con Cierre de Turno

### Frontend: Agregar hook en cierre exitoso

Archivo: `src/components/shifts/CloseShiftDialog.tsx`

```typescript
const handleCloseShift = async () => {
  // ... lógica existente de cierre ...
  
  const response = await fetch(`/api/shifts/${shiftId}/close`, { ... });
  
  if (response.ok) {
    // 🆕 Trigger backup automático en desktop
    if (typeof window !== 'undefined' && window.desktop?.backup) {
      const config = await window.desktop.backup.getConfig();
      
      if (config.enabled && config.onShiftClose) {
        const store = await getStoreInfo(); // Obtener info de tienda
        
        window.desktop.backup.create(
          { id: store.id, name: store.name, ruc: store.ruc },
          'shift-close'
        ).then(result => {
          if (result.success) {
            toast.success('Backup creado automáticamente');
          }
        }).catch(console.error);
      }
    }
    
    // ... resto de lógica ...
  }
};
```

---

## Datos Incluidos en Backup

| Entidad | Incluido | Notas |
|---------|----------|-------|
| Store | ✅ | Solo metadatos (nombre, RUC, etc.) |
| StoreSettings | ✅ | Configuración completa |
| Users | ✅ | Sin passwords |
| ProductMasters | ✅ | Catálogo de productos |
| StoreProducts | ✅ | Precios y stock |
| Shifts | ✅ | Historial de turnos |
| Sales + Items | ✅ | Ventas completas |
| Movements | ✅ | Movimientos de inventario |
| Customers | ✅ | Clientes |
| Receivables | ✅ | Cuentas por cobrar + pagos |

---

## Verificación de Integridad

Cada backup incluye un checksum SHA-256:

```json
{
  "checksum": "sha256:abc123def456..."
}
```

Al restaurar:
1. Se recalcula el hash de `data.json`
2. Se compara con el checksum del metadata
3. Si no coinciden, se rechaza la restauración

---

## Limpieza Automática

Los backups antiguos se eliminan automáticamente:

- Configurado via `maxBackups`
- Retiene los N más recientes
- Ejecuta después de cada backup exitoso

---

## Eventos IPC Disponibles

| Canal | Descripción |
|-------|-------------|
| `backup:progress` | Progreso del backup (%) |
| `backup:completed` | Backup finalizado |
| `backup:error` | Error en backup |

### Suscribirse a eventos

```typescript
window.desktop.on('backup:completed', (result) => {
  console.log('Backup completado:', result.fileName);
});

window.desktop.on('backup:error', (error) => {
  console.error('Error en backup:', error);
});
```

---

## Troubleshooting

### Backup falla con "No se pudo obtener datos del servidor"

1. Verificar que el servidor local está corriendo
2. Comprobar autenticación (session activa)
3. Revisar logs en DevTools

### Restore falla con "STORE_MISMATCH"

El backup es de una tienda diferente. Solo puedes restaurar backups de la misma tienda.

### Los backups no se crean automáticamente

1. Verificar `config.enabled === true`
2. Verificar `config.onShiftClose === true` para backups de turno
3. Verificar `config.intervalHours > 0` para backups programados

---

## Archivos Relacionados

| Archivo | Propósito |
|---------|-----------|
| [desktop/src/backupScheduler.ts](../desktop/src/backupScheduler.ts) | Lógica principal |
| [desktop/src/main.ts](../desktop/src/main.ts) | Handlers IPC |
| [desktop/src/preload.ts](../desktop/src/preload.ts) | API expuesta |
| [src/app/api/backups/restore/local/route.ts](../src/app/api/backups/restore/local/route.ts) | Endpoint restore |
