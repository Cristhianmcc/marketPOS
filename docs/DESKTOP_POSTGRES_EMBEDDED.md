# MarketPOS Desktop - Embedded PostgreSQL (D7.1)

## Overview

Este módulo proporciona PostgreSQL embebido para la aplicación desktop. El usuario final no necesita instalar PostgreSQL manualmente - la aplicación lo gestiona automáticamente.

## Características

- ✅ PostgreSQL portable incluido en el instalador
- ✅ Inicialización automática del cluster de datos
- ✅ Generación de contraseña segura (24 caracteres)
- ✅ Puerto no estándar (54329) para evitar conflictos
- ✅ Solo escucha en 127.0.0.1 (seguridad)
- ✅ Auto-recuperación de errores
- ✅ Shutdown limpio al cerrar la app

## Ubicación de Datos

```
Documents/MarketPOS/
├── pg/
│   └── data/           # Cluster PostgreSQL
│       ├── PG_VERSION
│       ├── postgresql.conf
│       ├── pg_hba.conf
│       └── ...
├── logs/
│   └── postgres.log    # Logs de PostgreSQL
└── config/
    └── runtime.json    # Configuración runtime (puerto, password)
```

## Configuración Runtime

Archivo: `Documents/MarketPOS/config/runtime.json`

```json
{
  "pg": {
    "port": 54329,
    "user": "marketpos",
    "password": "GENERATED_24_CHAR_PASSWORD",
    "db": "marketpos_desktop",
    "dataDir": "C:\\Users\\User\\Documents\\MarketPOS\\pg\\data",
    "binDir": "C:\\Program Files\\MarketPOS\\resources\\postgres\\bin"
  },
  "initialized": true,
  "lastStarted": "2026-02-13T10:00:00.000Z"
}
```

> ⚠️ **IMPORTANTE**: La contraseña se genera una sola vez y NO debe compartirse.

## Flujo de Arranque

```
1. app.whenReady()
   │
2. ensurePostgres()
   ├── checkPgBinaries() - Verificar binarios PG existen
   ├── loadRuntimeConfig() - Cargar o crear configuración
   ├── findFreePort() - Verificar puerto disponible
   ├── initializeCluster() - Si dataDir vacío, ejecutar initdb
   ├── startPostgres() - pg_ctl start
   ├── createDatabase() - createdb si no existe
   └── return DATABASE_URL
   │
3. preflightChecks() - Verificaciones adicionales
   │
4. startLocalServer() - Next.js con DATABASE_URL configurado
   │
5. createMainWindow() - Ventana Electron
```

## Preparación de Binarios PostgreSQL

### Opción 1: Descargar Portable (Recomendado)

1. Ir a https://www.enterprisedb.com/download-postgresql-binaries
2. Descargar "PostgreSQL Windows x64 Binaries" (ZIP)
3. Extraer el contenido
4. Copiar las siguientes carpetas a `desktop/vendor/postgres/`:

```
desktop/vendor/postgres/
├── bin/
│   ├── initdb.exe
│   ├── pg_ctl.exe
│   ├── pg_isready.exe
│   ├── createdb.exe
│   ├── psql.exe
│   ├── postgres.exe
│   └── ... (otros binarios necesarios)
├── lib/
│   └── ... (DLLs necesarias)
└── share/
    └── ... (archivos de localización)
```

### Opción 2: Script de Descarga (Automatizado)

```powershell
# Ejecutar desde el directorio desktop/
scripts/download-postgres.ps1
```

### Verificar Binarios

```powershell
cd desktop/vendor/postgres/bin
.\pg_ctl.exe --version
# Debería mostrar: pg_ctl (PostgreSQL) 16.x
```

## Configuración de PostgreSQL

### postgresql.conf (Auto-generado)

```conf
# MarketPOS Desktop Configuration
listen_addresses = '127.0.0.1'    # Solo local
port = 54329                       # Puerto no estándar
max_connections = 50               # Suficiente para bodega
shared_buffers = 128MB             # Memoria compartida
effective_cache_size = 256MB       # Cache
work_mem = 4MB                     # Memoria de trabajo
maintenance_work_mem = 64MB        # Mantenimiento
synchronous_commit = on            # ACID garantizado
```

### pg_hba.conf (Auto-generado)

```conf
# Solo conexiones locales con autenticación MD5
host    all    all    127.0.0.1/32    md5
host    all    all    ::1/128         md5
```

## Seguridad

1. **Red**: PostgreSQL solo escucha en 127.0.0.1 (localhost)
2. **Puerto**: Puerto no estándar (54329) evita conflictos
3. **Password**: Generado aleatoriamente (24 caracteres)
4. **Almacenamiento**: Config en Documents del usuario (solo acceso local)
5. **Logs**: Sin información sensible en logs

### Export de Diagnóstico

Para soporte técnico, usar la función de exportar diagnóstico que OCULTA la contraseña:

```typescript
// En preload API
window.desktop.postgres.exportDiagnostics();
// Genera archivo con password redactada
```

## Resolución de Problemas

### Puerto ocupado

Si el puerto 54329 está ocupado:
1. La app detecta automáticamente
2. Busca puerto libre en rango 54329-54399
3. Actualiza runtime.json con nuevo puerto

### Cluster corrupto

Si la base de datos se corrompe:
1. Diálogo de error aparece
2. Opciones:
   - **Restaurar Backup**: Usa backup ZIP anterior
   - **Crear Nueva**: Elimina todo y reinicializa (peligroso)

### PostgreSQL no inicia

Verificar:
1. Logs en `Documents/MarketPOS/logs/postgres.log`
2. Que no haya otro Postgres corriendo
3. Espacio en disco disponible
4. Permisos de escritura en Documents

### Reiniciar desde cero

Para forzar reinicialización completa:

1. Cerrar MarketPOS
2. Eliminar carpeta `Documents/MarketPOS/pg/data/`
3. Eliminar `Documents/MarketPOS/config/runtime.json`
4. Reiniciar MarketPOS

## Desarrollo

### Estructura de Código

```
desktop/src/runtime/postgres/
├── index.ts           # Exports principales
├── pgPaths.ts         # Rutas y configuración
├── generatePassword.ts # Generador de contraseñas
├── findFreePort.ts    # Búsqueda de puertos
├── initDb.ts          # Inicialización de cluster
├── startPostgres.ts   # Arranque de servidor
├── stopPostgres.ts    # Apagado de servidor
└── ensurePostgres.ts  # Orquestador principal
```

### Testing en Desarrollo

En modo desarrollo (`npm run dev`), PostgreSQL embebido NO se usa.
Se conecta al PostgreSQL del sistema o a la URL configurada en `.env`.

### Build para Producción

```bash
# 1. Asegurar binarios PostgreSQL en vendor/
ls desktop/vendor/postgres/bin/pg_ctl.exe

# 2. Build normal
npm run desktop:build

# El instalador incluirá PostgreSQL automáticamente
```

## Checklist de Verificación

- [ ] Instalar en PC sin PostgreSQL instalado
- [ ] Verificar que `Documents/MarketPOS/pg/data/PG_VERSION` existe
- [ ] Verificar que PostgreSQL corre en 127.0.0.1:54329
- [ ] Ejecutar ventas, turnos, backup: funcionan offline
- [ ] Cerrar app → PostgreSQL se detiene
- [ ] Reiniciar app → Reusa misma base de datos
- [ ] Probar con puerto ocupado → Elige otro puerto automáticamente
- [ ] Backup/restore sigue funcionando
- [ ] No afecta web cloud (diferentes DATABASE_URL)

## Versiones Compatibles

| PostgreSQL | Estado |
|------------|--------|
| 16.x | ✅ Recomendado |
| 15.x | ✅ Compatible |
| 14.x | ✅ Compatible |
| 13.x | ⚠️ Funcional, no testeado |
