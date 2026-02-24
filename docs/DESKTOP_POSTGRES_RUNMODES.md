# D7.2 - PostgreSQL Run Modes (Desktop)

MarketPOS Desktop incluye PostgreSQL embebido para funcionamiento 100% offline. Este módulo permite configurar cómo se ejecuta PostgreSQL en Windows.

## Modos de Ejecución

### 1. APP_LIFETIME (Default)

PostgreSQL se inicia y detiene junto con MarketPOS.

**Características:**
- ✅ No requiere permisos especiales
- ✅ Sin configuración adicional
- ✅ Limpia al cerrar
- ⚠️ PostgreSQL no disponible cuando la app está cerrada

**Caso de uso:** Uso normal, una ventana de app.

### 2. TASK_AT_LOGON

PostgreSQL se registra como tarea programada que inicia al hacer login en Windows.

**Características:**
- ✅ No requiere permisos de administrador
- ✅ PostgreSQL disponible antes de abrir la app
- ✅ Soporta múltiples ventanas de app
- ⚠️ Solo activo cuando hay sesión iniciada

**Implementación:**
```powershell
schtasks /Create /TN "MarketPOS-PostgreSQL" /TR "path\to\app.exe --pg-daemon" /SC ONLOGON /RL LIMITED
```

**Caso de uso:** Usuarios que abren múltiples ventanas o necesitan que Postgres esté listo inmediatamente.

### 3. WINDOWS_SERVICE

PostgreSQL se registra como servicio de Windows usando NSSM.

**Características:**
- ✅ PostgreSQL siempre disponible (incluso sin sesión)
- ✅ Se inicia automáticamente con Windows
- ✅ Mayor estabilidad
- ⚠️ Requiere permisos de administrador para instalar/desinstalar

**Implementación:**
- Usa NSSM (Non-Sucking Service Manager) incluido en `vendor/nssm/`
- Servicio se registra como "MarketPOS-PostgreSQL"

**Caso de uso:** Servidores, equipos compartidos, alta disponibilidad.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     MarketPOS Desktop                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │ APP_LIFETIME │    │ TASK_AT_LOGON│    │WINDOWS_SERVIC│      │
│   │              │    │              │    │              │      │
│   │ startPostgres│    │ schtasks.exe │    │ NSSM + SC    │      │
│   │ stopPostgres │    │ --pg-daemon  │    │ services.msc │      │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│          │                   │                   │               │
│          └───────────────────┴───────────────────┘               │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │    PostgreSQL     │                        │
│                    │   (Embebido)      │                        │
│                    │ vendor/postgres/  │                        │
│                    └───────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Daemon Mode (`--pg-daemon`)

Cuando se ejecuta con `--pg-daemon`, la app:

1. Inicia PostgreSQL
2. Mantiene el proceso vivo sin abrir ventana
3. Se comunica vía named pipes para shutdown

```typescript
// main.ts
const isPgDaemonMode = process.argv.includes('--pg-daemon');

if (isPgDaemonMode) {
  // Solo inicia PostgreSQL, sin ventana
  await ensurePostgres();
  // Mantiene proceso vivo
}
```

## API (Preload)

```typescript
window.desktop.pg.getStatus()      // Estado actual
window.desktop.pg.getConfig()      // Configuración runtime
window.desktop.pg.setRunMode(mode) // Cambiar modo
window.desktop.pg.registerTask()   // Registrar tarea programada
window.desktop.pg.removeTask()     // Eliminar tarea
window.desktop.pg.installService() // Instalar servicio (admin)
window.desktop.pg.removeService()  // Desinstalar servicio (admin)
window.desktop.pg.start()          // Iniciar manualmente
window.desktop.pg.stop()           // Detener manualmente
window.desktop.pg.isAdmin()        // ¿Ejecutando como admin?
```

## IPC Handlers

| Channel | Descripción |
|---------|-------------|
| `pg:get-status` | Obtener estado de PostgreSQL |
| `pg:get-config` | Obtener configuración runtime |
| `pg:set-run-mode` | Cambiar modo de ejecución |
| `pg:register-task` | Registrar tarea programada |
| `pg:remove-task` | Eliminar tarea programada |
| `pg:get-task-status` | Estado de tarea programada |
| `pg:install-service` | Instalar servicio Windows |
| `pg:remove-service` | Desinstalar servicio |
| `pg:get-service-status` | Estado del servicio |
| `pg:start` | Iniciar PostgreSQL |
| `pg:stop` | Detener PostgreSQL |
| `pg:is-admin` | Verificar permisos admin |

## Archivos Creados

```
desktop/src/runtime/postgres/
├── pgPaths.ts              # Tipos PgRunMode, paths
├── registerTaskScheduler.ts # Task Scheduler management
├── windowsService.ts       # NSSM-based service
├── ensurePostgres.ts       # Orquestador principal
├── startPostgres.ts        # Iniciar pg_ctl
├── stopPostgres.ts         # Detener gracefully
├── initDb.ts               # Inicializar cluster
├── findFreePort.ts         # Puerto disponible
├── generatePassword.ts     # Contraseña random
└── index.ts                # Exports
```

## UI Settings

La página `/settings/database` permite:

1. Ver estado actual de PostgreSQL
2. Iniciar/detener manualmente
3. Seleccionar modo de ejecución
4. Ver configuración (puerto, directorio, etc.)

Solo visible en desktop (`window.desktop.isDesktop === true`).

## Requisitos

- **APP_LIFETIME**: Ninguno
- **TASK_AT_LOGON**: Usuario puede crear tareas programadas (default en Windows)
- **WINDOWS_SERVICE**: Ejecutar como administrador + NSSM en `vendor/nssm/`

## Troubleshooting

### PostgreSQL no inicia

1. Verificar puerto no ocupado
2. Revisar logs en `%APPDATA%/MarketPOS/postgres-data/log/`
3. Verificar permisos en directorio de datos

### Tarea programada no se crea

```powershell
# Listar tareas
schtasks /Query /TN "MarketPOS-PostgreSQL"

# Eliminar manualmente
schtasks /Delete /TN "MarketPOS-PostgreSQL" /F
```

### Servicio no se instala

1. Verificar NSSM existe en `vendor/nssm/win64/nssm.exe`
2. Ejecutar como administrador
3. Verificar no hay servicio con mismo nombre:
   ```powershell
   sc query MarketPOS-PostgreSQL
   sc delete MarketPOS-PostgreSQL
   ```

## Notas de Seguridad

- La contraseña de PostgreSQL se genera aleatoriamente en primera ejecución
- Se almacena en `runtime.json` (no encriptado, pero local)
- PostgreSQL solo escucha en `localhost` (no disponible en red)
- Los datos están en `%APPDATA%/MarketPOS/postgres-data/`
