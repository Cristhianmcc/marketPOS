# D8 - Cloud Backup Sync

Sistema de sincronización automática de backups locales a almacenamiento en la nube compatible con S3.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FLOW DIAGRAM                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Desktop App                           Cloud API                         │
│  ┌───────────────┐                    ┌───────────────┐                 │
│  │ BackupScheduler│──creates──────────>│   .zip file   │                 │
│  └───────────────┘                    └───────────────┘                 │
│         │                                    │                           │
│         │ triggers                           │                           │
│         ▼                                    ▼                           │
│  ┌───────────────┐                    ┌───────────────┐                 │
│  │CloudBackupSync│                    │ SHA256 hash   │                 │
│  └───────────────┘                    └───────────────┘                 │
│         │                                    │                           │
│         │ 1. Request upload URL              │                           │
│         ├────────────────────────────────────┼─────────────────────────> │
│         │                                    │     POST /api/cloud-backups│
│         │                                    │          /request-upload  │
│         │ <──────────presignedUrl────────────┤                           │
│         │                                    │                           │
│         │ 2. PUT file directly to S3         │                           │
│         ├────────────────────────────────────┼──────────> S3 Bucket      │
│         │                                    │                           │
│         │ 3. Confirm upload                  │                           │
│         ├────────────────────────────────────┼─────────────────────────> │
│         │                                    │     POST /api/cloud-backups│
│         │                                    │          /confirm-upload  │
│         │ <──────────success─────────────────┤                           │
│         │                                    │                           │
└─────────┴────────────────────────────────────┴───────────────────────────┘
```

## Características

- **Auto-sync**: Sincronización automática cada 15 minutos cuando hay internet
- **Deduplicación**: Por SHA256 - no se sube dos veces el mismo backup
- **Retry con backoff exponencial**: 1m, 5m, 15m, 60m (máximo 10 intentos)
- **Presigned URLs**: URLs firmadas de 10 minutos para upload/download
- **Retención configurable**: Limpieza automática de backups antiguos
- **Multi-plataforma S3**: AWS S3, Cloudflare R2, Backblaze B2, MinIO

## Configuración

### Variables de Entorno (.env)

```env
# S3 Configuration (AWS S3 / Cloudflare R2 / Backblaze B2 / MinIO)
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=marketpos-backups
S3_REGION=us-east-1
S3_ENDPOINT=          # Optional: for non-AWS (e.g., https://xxx.r2.cloudflarestorage.com)
S3_FORCE_PATH_STYLE=false   # true for MinIO/Backblaze, false for AWS/R2

# Backup Retention
BACKUP_RETENTION_DAYS=30
BACKUP_MAX_COUNT=100

# Cron Secret (for retention job)
CRON_SECRET=your-random-secret-32chars-minimum
```

### Proveedores Soportados

#### AWS S3
```env
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=my-bucket
S3_REGION=us-east-1
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
```

#### Cloudflare R2
```env
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=my-bucket
S3_REGION=auto
S3_ENDPOINT=https://account-id.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=false
```

#### Backblaze B2
```env
S3_ACCESS_KEY_ID=keyID
S3_SECRET_ACCESS_KEY=applicationKey
S3_BUCKET_NAME=my-bucket
S3_REGION=us-west-004
S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
S3_FORCE_PATH_STYLE=true
```

#### MinIO (Self-hosted)
```env
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=backups
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_FORCE_PATH_STYLE=true
```

## API Endpoints

Todos los endpoints requieren autenticación con rol **SUPERADMIN**.

### GET /api/cloud-backups

Lista todos los backups en la nube.

```typescript
// Query params
?storeId=xxx  // Optional: filtrar por tienda

// Response
{
  backups: Array<{
    id: string;
    objectKey: string;
    fileName: string;
    sizeBytes: number;
    sha256: string;
    status: 'UPLOADING' | 'AVAILABLE' | 'DELETED' | 'FAILED';
    storeId: string;
    storeName: string;
    createdAt: string;
    uploadedAt: string?;
  }>
}
```

### POST /api/cloud-backups/request-upload

Solicita URL firmada para subir un backup.

```typescript
// Request body
{
  storeId: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
}

// Response (200 - nuevo upload)
{
  uploadUrl: string;
  objectKey: string;
  backupId: string;
  expiresIn: 600;
}

// Response (200 - ya existe)
{
  exists: true;
  backupId: string;
  message: string;
}
```

### POST /api/cloud-backups/confirm-upload

Confirma que un upload completó exitosamente.

```typescript
// Request body
{
  backupId: string;
  sha256: string;  // Para validación
}

// Response
{
  success: true;
  backup: { id, status, uploadedAt }
}
```

### POST /api/cloud-backups/request-download

Solicita URL firmada para descargar un backup.

```typescript
// Request body
{
  backupId: string;
}

// Response
{
  downloadUrl: string;
  fileName: string;
  expiresIn: 600;
}
```

### DELETE /api/cloud-backups/[id]

Elimina un backup de la nube.

```typescript
// Response
{
  success: true;
  message: string;
}
```

### POST /api/cloud-backups/retention-run

Ejecuta limpieza de backups antiguos (para CRON).

```typescript
// Headers
X-Cron-Secret: your-cron-secret

// Response
{
  success: true;
  deleted: number;
  remaining: number;
  details: {
    byAge: number;
    byCount: number;
  }
}
```

## Desktop Integration

### CloudBackupSync Class

```typescript
// Ubicación: desktop/src/sync/cloudBackupSync.ts

class CloudBackupSync {
  // Auto-sincroniza cada 15 minutos
  startAutoSync(): void;
  stopAutoSync(): void;
  
  // Sincronización manual
  syncNow(): Promise<void>;
  
  // Disparar después de backup local
  triggerAfterBackup(): void;
  
  // Estado actual
  getState(): SyncState;
  getStats(): CloudSyncStats;
  
  // Gestionar backups completados
  cleanupDoneBackups(): Promise<void>;
  
  // Reintentar fallidos
  resetFailedBackups(): Promise<void>;
  
  // Configurar autenticación
  setAuth(apiUrl: string, token: string): void;
}
```

### IPC Handlers (Main Process)

```typescript
// cloud-sync:get-state - Obtener estado actual
// cloud-sync:get-stats - Obtener estadísticas
// cloud-sync:sync-now - Forzar sincronización
// cloud-sync:cleanup-done - Limpiar backups ya subidos
// cloud-sync:reset-failed - Reintentar fallidos
// cloud-sync:set-auth - Configurar API y token
```

### Preload API (Renderer)

```typescript
window.api.cloudSync.getState(): Promise<SyncState>;
window.api.cloudSync.getStats(): Promise<CloudSyncStats>;
window.api.cloudSync.syncNow(): Promise<void>;
window.api.cloudSync.cleanupDone(): Promise<void>;
window.api.cloudSync.resetFailed(): Promise<void>;
window.api.cloudSync.setAuth(apiUrl: string, token: string): Promise<void>;
```

## Estado de Sincronización

El estado se persiste en `backups/cloud-sync.json`:

```typescript
interface SyncState {
  lastSyncAt: string | null;
  pendingBackups: Array<{
    filePath: string;
    sha256: string;
    sizeBytes: number;
    storeId: string;
    addedAt: string;
    retries: number;
    lastError?: string;
  }>;
  uploadedBackups: string[];  // SHA256 of completed uploads
  failedBackups: Array<{
    filePath: string;
    sha256: string;
    error: string;
    failedAt: string;
    retries: number;
  }>;
}
```

## UI - Panel de Administración

Accesible en `/admin/backups` con dos tabs:

1. **Restaurar Local**: Subir y restaurar backup a nueva tienda
2. **Backups en la Nube**: Ver, descargar y eliminar backups cloud

### Funcionalidades UI

- Ver estadísticas de sincronización (pendientes, subidos, fallidos)
- Forzar sincronización manual
- Filtrar backups por tienda
- Descargar backup individual (URL firmada)
- Eliminar backup de la nube
- Limpiar backups completados localmente
- Reintentar backups fallidos

## Cron Job - Retención

Configurar un cron job para ejecutar diariamente:

```bash
# crontab -e
0 3 * * * curl -X POST https://your-app.com/api/cloud-backups/retention-run \
  -H "X-Cron-Secret: your-cron-secret"
```

### Estrategia de Retención

1. **Por edad**: Elimina backups más antiguos que `BACKUP_RETENTION_DAYS`
2. **Por cantidad**: Mantiene máximo `BACKUP_MAX_COUNT` por tienda

## Seguridad

- **SUPERADMIN only**: Todos los endpoints requieren rol SUPERADMIN
- **Presigned URLs**: Expiran en 10 minutos
- **SHA256 validation**: Validación de integridad en cada operación
- **CRON_SECRET**: Protección del endpoint de retención
- **No almacena contraseñas**: Los backups no incluyen hashes de contraseña

## Troubleshooting

### Backup no se sincroniza

1. Verificar conexión a internet
2. Revisar `backups/cloud-sync.json` para errores
3. Verificar credenciales S3 en variables de entorno
4. Comprobar permisos del bucket S3

### Error "Access Denied" en S3

1. Verificar `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`
2. Revisar políticas IAM del usuario/rol
3. Verificar CORS del bucket si aplica

### Backups duplicados

No deberían existir - el sistema deduplica por SHA256. 
Si ocurren, revisar la constraint única en la base de datos.

### Retención no funciona

1. Verificar que `CRON_SECRET` coincide
2. Revisar logs del cron job
3. Verificar `BACKUP_RETENTION_DAYS` y `BACKUP_MAX_COUNT`

## Modelo de Datos

```prisma
enum CloudBackupStatus {
  UPLOADING
  AVAILABLE
  DELETED
  FAILED
}

model CloudBackup {
  id           String            @id @default(cuid())
  objectKey    String            @unique
  fileName     String
  sizeBytes    Int
  sha256       String
  status       CloudBackupStatus @default(UPLOADING)
  storeId      String
  store        Store             @relation(fields: [storeId], references: [id])
  uploadedById String?
  uploadedBy   User?             @relation(fields: [uploadedById], references: [id])
  createdAt    DateTime          @default(now())
  uploadedAt   DateTime?
  deletedAt    DateTime?
  
  @@unique([storeId, sha256])
  @@index([storeId])
  @@index([status])
}
```
