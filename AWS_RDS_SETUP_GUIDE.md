# 🚀 GUÍA DE CONFIGURACIÓN: AWS RDS para Market POS (10 Tiendas)

## 📋 ÍNDICE
1. [Configuración Óptima de Prisma](#configuración-prisma)
2. [Setup AWS RDS Free Tier](#setup-aws-rds)
3. [Connection Pooling](#connection-pooling)
4. [Migración desde Render](#migración)
5. [Monitoreo y Alertas](#monitoreo)
6. [Plan de Escalamiento](#escalamiento)

---

## 1️⃣ CONFIGURACIÓN ÓPTIMA DE PRISMA

### Archivo: `src/infra/db/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// CONFIGURACIÓN OPTIMIZADA PARA 10 TIENDAS EN RDS FREE TIER
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
    
    // 🔥 CRITICAL: Connection pooling para múltiples tiendas
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Manejo de señales para cerrar conexiones limpiamente
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
```

### Archivo: `.env`

```bash
# DATABASE URL CON CONNECTION POOLING OPTIMIZADO
# Para RDS Free Tier (db.t3.micro): máximo 100 conexiones
# Distribución recomendada para 10 tiendas:
#   - connection_limit=8 por instancia Next.js
#   - pool_timeout=20 segundos
#   - Si tienes 3 instancias Next.js = 24 conexiones totales (safe)

DATABASE_URL="postgresql://username:password@your-rds-endpoint.rds.amazonaws.com:5432/market_pos?connection_limit=8&pool_timeout=20&connect_timeout=10"

# IMPORTANTE: Agregar estos parámetros
# connection_limit=8    → Máximo 8 conexiones por instancia Next.js
# pool_timeout=20       → Espera 20s antes de timeout si no hay conexión disponible
# connect_timeout=10    → Timeout de conexión inicial a 10s
# schema=public         → Schema por defecto (opcional)
```

---

## 2️⃣ SETUP AWS RDS FREE TIER

### Paso 1: Crear RDS en AWS Console

1. **Ir a RDS Console** → `Create database`
2. **Configuración recomendada:**

```yaml
ENGINE: PostgreSQL
VERSION: PostgreSQL 16.x (última estable)
TEMPLATE: Free tier ✅

# SETTINGS
DB Instance Identifier: market-pos-db
Master Username: marketadmin
Master Password: [TU_PASSWORD_SEGURO]

# INSTANCE CONFIGURATION
DB Instance Class: db.t3.micro (1 vCPU, 1 GB RAM) ✅ FREE TIER

# STORAGE
Storage Type: General Purpose SSD (gp3)
Allocated Storage: 20 GB ✅ FREE TIER
Storage Autoscaling: DISABLE (mantener en 20 GB para free tier)

# CONNECTIVITY
Public Access: YES (para acceso desde tu app en Vercel/otro hosting)
VPC Security Group: Create new
  - Inbound Rules:
    - Type: PostgreSQL
    - Port: 5432
    - Source: 0.0.0.0/0 (⚠️ cambiar a IPs específicas en producción)

# ADDITIONAL CONFIGURATION
Initial Database Name: market_pos
Backup Retention Period: 7 days ✅ FREE TIER (hasta 20 GB)
Enable Encryption: YES
Enable Enhanced Monitoring: NO (genera costo)
Enable Performance Insights: NO (genera costo)
Enable CloudWatch Logs:
  - PostgreSQL log: YES
  - Upgrade log: NO
```

### Paso 2: Configurar Security Group

```bash
# Después de crear RDS, agregar reglas al Security Group:
# 1. Ir a EC2 → Security Groups
# 2. Seleccionar el grupo de tu RDS
# 3. Edit Inbound Rules:

Type: PostgreSQL
Protocol: TCP
Port: 5432
Source: Custom
  - Tu IP local (para testing): TU_IP/32
  - Vercel/Render IPs (para producción):
    76.76.21.0/24, 76.223.0.0/21 (Vercel)
    216.24.57.0/24 (Render)

# MEJOR PRÁCTICA: Usar VPN o Bastion Host para administración
```

### Paso 3: Conectar y Configurar PostgreSQL

```bash
# Conectar desde tu máquina local
psql -h your-rds-endpoint.rds.amazonaws.com -U marketadmin -d market_pos

# Una vez conectado, ejecutar configuraciones:
-- Aumentar max_connections si es necesario (default: 100)
ALTER SYSTEM SET max_connections = 100;

-- Configurar work_mem para mejor performance
ALTER SYSTEM SET work_mem = '64MB';

-- Configurar shared_buffers (25% de RAM = ~256 MB para 1GB RAM)
ALTER SYSTEM SET shared_buffers = '256MB';

-- Habilitar logging de queries lentas (> 500ms)
ALTER SYSTEM SET log_min_duration_statement = 500;

-- Reload configuration
SELECT pg_reload_conf();
```

---

## 3️⃣ CONNECTION POOLING CON PGBOUNCER (RECOMENDADO)

Para maximizar conexiones y reducir latencia, usa **PgBouncer** como proxy.

### Opción A: PgBouncer en Railway (Recomendado)

```bash
# 1. Crear servicio PgBouncer en Railway
# 2. Configurar variables:

DATABASE_URL=postgresql://marketadmin:password@your-rds-endpoint.rds.amazonaws.com:5432/market_pos

# 3. Railway generará automáticamente:
PGBOUNCER_URL=postgresql://user:pass@pgbouncer-railway.up.railway.app:5432/market_pos?pgbouncer=true

# 4. Usar PGBOUNCER_URL en tu app Next.js:
DATABASE_URL="${PGBOUNCER_URL}"
```

### Opción B: PgBouncer en EC2 (Más control)

```bash
# En instancia EC2 free tier (t2.micro):
sudo apt-get install pgbouncer

# Editar /etc/pgbouncer/pgbouncer.ini:
[databases]
market_pos = host=your-rds-endpoint.rds.amazonaws.com port=5432 dbname=market_pos

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 5
```

**Documentación PgBouncer:** https://www.pgbouncer.org/

---

## 4️⃣ MIGRACIÓN DESDE RENDER

### Paso 1: Backup de Base de Datos Actual

```bash
# Desde tu máquina local, conectar a Render y hacer dump:
pg_dump -h your-render-host.render.com -U your_user -d your_db -F c -b -v -f market_pos_backup.dump

# Verificar tamaño del backup:
ls -lh market_pos_backup.dump
```

### Paso 2: Restaurar en AWS RDS

```bash
# Opción 1: Usando pg_restore
pg_restore -h your-rds-endpoint.rds.amazonaws.com -U marketadmin -d market_pos -v market_pos_backup.dump

# Opción 2: Si tienes archivo SQL plano:
psql -h your-rds-endpoint.rds.amazonaws.com -U marketadmin -d market_pos < market_pos_backup.sql
```

### Paso 3: Verificar Migración

```bash
# Conectar a RDS:
psql -h your-rds-endpoint.rds.amazonaws.com -U marketadmin -d market_pos

# Verificar tablas:
\dt

# Verificar conteo de registros:
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

# Verificar integridad:
SELECT COUNT(*) FROM "Store";
SELECT COUNT(*) FROM "Sale";
SELECT COUNT(*) FROM "Product";
```

### Paso 4: Actualizar Variables de Entorno

```bash
# En tu proyecto Next.js (Vercel/otro):
# 1. Ir a Settings → Environment Variables
# 2. Actualizar:

DATABASE_URL=postgresql://marketadmin:password@your-rds-endpoint.rds.amazonaws.com:5432/market_pos?connection_limit=8&pool_timeout=20

# 3. Redeploy la aplicación
# 4. Verificar que funciona correctamente
```

### Paso 5: Ejecutar Prisma Migrations

```bash
# Local:
npx prisma migrate deploy

# Verificar schema:
npx prisma db push --accept-data-loss
```

---

## 5️⃣ MONITOREO Y ALERTAS

### Configurar CloudWatch Alarms (Free Tier incluido)

```yaml
# En AWS CloudWatch → Alarms:

1. CPU Utilization
   Metric: CPUUtilization
   Threshold: > 80% por 5 minutos
   Action: SNS email alert

2. Freeable Memory
   Metric: FreeableMemory
   Threshold: < 200 MB por 5 minutos
   Action: SNS email alert

3. Database Connections
   Metric: DatabaseConnections
   Threshold: > 80 conexiones
   Action: SNS email alert

4. Disk Space
   Metric: FreeStorageSpace
   Threshold: < 2 GB
   Action: SNS email alert
```

### Script de Monitoreo Local

```bash
# Crear: scripts/monitor-db.sh

#!/bin/bash
psql $DATABASE_URL -c "
SELECT 
  count(*) as active_connections,
  max_conn - count(*) as available_connections
FROM pg_stat_activity, 
  (SELECT setting::int as max_conn FROM pg_settings WHERE name='max_connections') as mc;
"

psql $DATABASE_URL -c "
SELECT 
  pg_size_pretty(pg_database_size('market_pos')) as db_size;
"
```

### Dashboard Prisma Pulse (Opcional - $19/mes)

```bash
# Instalar Prisma Pulse para monitoreo en tiempo real:
npm install @prisma/extension-pulse

# Configuración en prisma.ts:
import { withPulse } from '@prisma/extension-pulse';

const prisma = new PrismaClient().$extends(
  withPulse({ apiKey: process.env.PULSE_API_KEY })
);
```

---

## 6️⃣ PLAN DE ESCALAMIENTO

### Cuándo Escalar de Free Tier

**Señales de que necesitas upgrade:**

```
❌ CPU > 80% constante por más de 1 hora
❌ Memoria < 100 MB disponible
❌ Conexiones > 90 frecuentemente
❌ Queries > 1000ms promedio
❌ Storage > 18 GB (90% de 20 GB)
```

### Upgrade Path (Después del Free Tier)

```yaml
# OPCIÓN 1: AWS RDS db.t3.small
Costo: ~$30/mes
RAM: 2 GB (doble)
Conexiones: 200
Storage: Hasta 100 GB
👉 Soporta: 20-30 tiendas

# OPCIÓN 2: Railway Pro
Costo: $20/mes + uso
RAM: Configurable
Backups automáticos
👉 Soporta: 20-30 tiendas

# OPCIÓN 3: DigitalOcean Managed DB
Costo: $15-35/mes
RAM: 1-4 GB
Backups automáticos diarios
👉 Soporta: 15-25 tiendas

# OPCIÓN 4: Neon Pro (Serverless)
Costo: $19/mes
Autoscaling
Sin límite de conexiones (pooling automático)
👉 Soporta: 30+ tiendas
```

### Capacidad por Configuración

```
AWS RDS db.t3.micro (1GB RAM):     10-12 tiendas ✅
AWS RDS db.t3.small (2GB RAM):     20-30 tiendas
AWS RDS db.t3.medium (4GB RAM):    50-80 tiendas
AWS RDS db.m5.large (8GB RAM):     100+ tiendas

Railway + PgBouncer:               20-40 tiendas
Neon Pro + Autoscaling:            Sin límite práctico
```

---

## 📊 ESTIMACIÓN DE COSTOS (POST FREE TIER)

### Después de 12 meses de AWS Free Tier:

```
OPCIÓN A: Mantener AWS RDS
  db.t3.micro:  $15-20/mes  (10-12 tiendas)
  db.t3.small:  $30-40/mes  (20-30 tiendas)
  + Backups:    $1-5/mes
  + Transfer:   $0-10/mes
  TOTAL:        $16-55/mes

OPCIÓN B: Migrar a Railway
  Plan Hobby:   $10/mes     (10-15 tiendas)
  Plan Pro:     $20/mes     (20-30 tiendas)
  + PgBouncer:  Incluido
  TOTAL:        $10-20/mes ✅ MÁS ECONÓMICO

OPCIÓN C: Migrar a Neon
  Plan Pro:     $19/mes     (30+ tiendas)
  Autoscaling:  Incluido
  Backups:      Incluidos
  TOTAL:        $19/mes ✅ MEJOR ESCALABILIDAD

OPCIÓN D: DigitalOcean
  Basic:        $15/mes     (10-15 tiendas)
  Professional: $35/mes     (30-40 tiendas)
  TOTAL:        $15-35/mes
```

---

## 🎯 RECOMENDACIÓN FINAL

### Para TUS 10 tiendas:

```
AÑO 1 (Meses 1-12):
  ✅ AWS RDS Free Tier (db.t3.micro, 20GB)
  ✅ Costo: $0/mes
  ✅ Capacidad: 10-12 tiendas
  ✅ Backups: Incluidos

AÑO 2+:
  ✅ Migrar a Railway Hobby/Pro
  ✅ Costo: $10-20/mes
  ✅ Capacidad: 20-30 tiendas
  ✅ Más fácil de administrar
  ✅ Sin sorpresas de facturación
```

### Checklist de Implementación

```
□ Crear cuenta AWS (si no tienes)
□ Activar Free Tier (12 meses)
□ Crear RDS PostgreSQL db.t3.micro
□ Configurar Security Groups (IPs permitidas)
□ Actualizar src/infra/db/prisma.ts con pooling
□ Actualizar DATABASE_URL con parámetros de conexión
□ Hacer backup de base de datos actual
□ Migrar datos a AWS RDS
□ Ejecutar prisma migrate deploy
□ Verificar funcionamiento en producción
□ Configurar CloudWatch Alarms
□ Crear script de monitoreo
□ Documentar credenciales en lugar seguro
□ Agendar revisión en mes 11 (antes de fin de free tier)
```

---

## 📞 SOPORTE Y RECURSOS

- **AWS RDS Docs:** https://docs.aws.amazon.com/rds/
- **Prisma Docs:** https://www.prisma.io/docs
- **PgBouncer:** https://www.pgbouncer.org/
- **PostgreSQL Tuning:** https://pgtune.leopard.in.ua/

---

## 🚨 IMPORTANTE

1. **Guarda tus credenciales** en un gestor de contraseñas (1Password, Bitwarden)
2. **Configura backups automáticos** desde el inicio
3. **Monitorea uso de Free Tier** en AWS Billing Dashboard
4. **Establece alertas de facturación** para evitar sorpresas
5. **Ten plan de migración listo** antes del mes 11

---

**¿Necesitas ayuda con la implementación?** Puedo ayudarte paso a paso.
