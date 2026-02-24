# MarketPOS Desktop - PostgreSQL Local Setup

## Introducción

El modo desktop de MarketPOS usa PostgreSQL local para funcionar **100% offline**.
No se requiere conexión a internet para las operaciones diarias.

```
┌─────────────────────────────────────────────────────────┐
│                   MODO DESKTOP                          │
│                                                         │
│  ┌─────────────┐     ┌─────────────┐                   │
│  │   Electron  │────▶│  Next.js    │                   │
│  │   Shell     │     │  Standalone │                   │
│  └─────────────┘     └──────┬──────┘                   │
│                             │                           │
│                      ┌──────▼──────┐                   │
│                      │   Prisma    │                   │
│                      │   Client    │                   │
│                      └──────┬──────┘                   │
│                             │                           │
│                      ┌──────▼──────┐                   │
│                      │  PostgreSQL │  ◀── LOCAL        │
│                      │  127.0.0.1  │                   │
│                      └─────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Requisitos

| Componente | Versión | Notas |
|------------|---------|-------|
| PostgreSQL | 14+ | Recomendado: 15 o 16 |
| Node.js | 18+ | Para Prisma CLI |
| Espacio disco | ~100MB | Para base de datos inicial |

## Instalación de PostgreSQL

### Windows

**Opción 1: Instalador oficial**
1. Descargar de https://www.postgresql.org/download/windows/
2. Ejecutar instalador
3. Puerto por defecto: 5432
4. Password: recordar el que pongas (default: `postgres`)

**Opción 2: Chocolatey**
```powershell
choco install postgresql16
```

**Opción 3: Winget**
```powershell
winget install PostgreSQL.PostgreSQL.16
```

### macOS

**Homebrew (recomendado)**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Postgres.app**
1. Descargar de https://postgresapp.com/
2. Arrastrar a Aplicaciones
3. Iniciar desde el menú

### Linux

**Ubuntu/Debian**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Fedora/RHEL**
```bash
sudo dnf install postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl start postgresql
```

## Inicialización de Base de Datos

### Automática (Recomendado)

**Windows (PowerShell)**
```powershell
cd C:\path\to\marketPOS
.\scripts\desktop\db-init.ps1
```

**Linux/macOS**
```bash
cd /path/to/marketPOS
chmod +x scripts/desktop/db-init.sh
./scripts/desktop/db-init.sh
```

### Manual

1. **Crear base de datos**
```sql
CREATE DATABASE marketpos_desktop;
```

2. **Copiar .env.desktop**
```bash
cp .env.desktop.example .env.desktop
# Editar con tus credenciales
```

3. **Ejecutar migraciones**
```bash
# Cargar variables de entorno
export $(cat .env.desktop | xargs)
# O en PowerShell: Get-Content .env.desktop | ForEach-Object { $_ -split "=" | Set-Variable -Name $args[0] -Value $args[1] }

npx prisma migrate deploy
```

4. **Ejecutar seed**
```bash
npx prisma db seed
```

## Configuración de Variables

Archivo: `.env.desktop`

```dotenv
# Base de datos local
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/marketpos_desktop"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/marketpos_desktop"

# Sesión (cambiar en producción)
SESSION_SECRET="tu-secreto-de-32-caracteres-minimo"

# Modo desktop activado
DESKTOP_MODE="1"
NODE_ENV="production"
```

## Scripts NPM

```json
{
  "scripts": {
    "desktop:dev": "npm run desktop:db-init && npm run desktop:start",
    "desktop:db-init": "npx ts-node scripts/desktop/db-init-check.ts",
    "desktop:start": "cd desktop && npm run dev"
  }
}
```

## Verificación

### Comprobar conexión
```bash
psql -h 127.0.0.1 -U postgres -d marketpos_desktop -c "SELECT COUNT(*) FROM \"Store\""
```

### Ver tablas creadas
```bash
psql -h 127.0.0.1 -U postgres -d marketpos_desktop -c "\dt"
```

### Prisma Studio (visual)
```bash
npx prisma studio
```

## Modo Offline

Con PostgreSQL local, MarketPOS funciona **completamente offline**:

| Función | Offline | Notas |
|---------|---------|-------|
| Login | ✅ | Credenciales en BD local |
| Ventas | ✅ | Guardadas localmente |
| Inventario | ✅ | Actualización inmediata |
| Reportes | ✅ | Datos locales |
| Clientes | ✅ | CRD completo |
| Turnos | ✅ | Apertura/cierre |
| Imágenes | ⚠️ | Solo las ya cacheadas |
| Sync Cloud | ❌ | Requiere internet (D5) |

## Troubleshooting

### "Connection refused"

```bash
# Verificar que PostgreSQL está corriendo
# Windows
Get-Service postgresql*

# Linux
sudo systemctl status postgresql

# macOS
brew services list | grep postgres
```

### "Database does not exist"

```bash
# Crear manualmente
psql -U postgres -c "CREATE DATABASE marketpos_desktop"
```

### "Permission denied"

```bash
# Dar permisos al usuario
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE marketpos_desktop TO postgres"
```

### "Migration failed"

```bash
# Resetear y volver a aplicar
npx prisma migrate reset --force
npx prisma db seed
```

### Puerto en uso

```bash
# Verificar qué usa el puerto
# Windows
netstat -ano | findstr :5432

# Linux/Mac
lsof -i :5432
```

## Backup Local

### Crear backup
```bash
pg_dump -h 127.0.0.1 -U postgres marketpos_desktop > backup_$(date +%Y%m%d).sql
```

### Restaurar backup
```bash
psql -h 127.0.0.1 -U postgres marketpos_desktop < backup_20240115.sql
```

## Próximos Pasos

- **D4**: Activación offline desde la nube
- **D5**: Sincronización bidireccional
- **D8**: PostgreSQL embebido en el instalador

## FAQ

**¿Puedo usar el mismo PostgreSQL que uso para desarrollo web?**
Sí, pero usa una base de datos diferente (`marketpos_desktop` vs `market_pos_dev`).

**¿Cuánto espacio necesita la base de datos?**
Inicial: ~10MB. Con 10,000 productos y 50,000 ventas: ~500MB.

**¿Puedo migrar datos de la nube al local?**
Sí, eso lo maneja el módulo D4 (pendiente).

**¿Es compatible con PostgreSQL 12?**
Mínimo requerido: PostgreSQL 14 (por características JSON y performance).
