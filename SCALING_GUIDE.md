# MÓDULO S10 — Guía de Escalado

## Para qué es este módulo

Este módulo prepara BodegaPOS para manejar **10+ tiendas** y más tráfico simultáneo sin degradar rendimiento.

### Problemas que resuelve

| Problema | Solución |
|----------|----------|
| Muchas conexiones DB agotan límite | PgBouncer + connection pooling |
| Assets lentos en regiones lejanas | CDN (Cloudflare/Vercel Edge) |
| Jobs SUNAT bloquean checkout | Worker separado con colas |
| Serverless cold starts | Prisma optimizado + pool |

---

## A) Connection Pooling (PostgreSQL)

### Estado actual

Ya configurado en `src/infra/db/prisma.ts` con parámetros en DATABASE_URL.

### Configuración recomendada

```env
# .env.production
# Para 10 tiendas con RDS Free Tier (100 conexiones max)
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20&connect_timeout=10"

# Con PgBouncer (recomendado para 20+ tiendas)
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/db?pgbouncer=true"
DIRECT_URL="postgresql://user:pass@rds-host:5432/db"  # Para migraciones
```

### Opción 1: Sin PgBouncer (hasta 10 tiendas)

```
┌─────────────────┐
│  Next.js App    │ connection_limit=10
│  (Serverless)   │────────────────────────► RDS PostgreSQL
└─────────────────┘                          (max 100 conexiones)
```

Cada función serverless tiene pool de 10 conexiones.

### Opción 2: Con PgBouncer (10+ tiendas)

```
┌─────────────────┐       ┌─────────────┐
│  Next.js App 1  │──────►│             │
├─────────────────┤       │  PgBouncer  │────► RDS PostgreSQL
│  Next.js App 2  │──────►│  (pooler)   │      (mantiene ~50)
├─────────────────┤       │             │
│  SUNAT Worker   │──────►└─────────────┘
└─────────────────┘
        ▲
   Cientos de 
   conexiones cortas
```

PgBouncer mantiene ~50 conexiones persistentes a RDS y multiplexa miles de conexiones cliente.

### Instalar PgBouncer en Railway

```bash
# 1. Crear servicio en Railway
railway add -t pgbouncer

# 2. Configurar variables en Railway
PGBOUNCER_DATABASE_URL=postgresql://user:pass@rds:5432/db
PGBOUNCER_DEFAULT_POOL_SIZE=50
PGBOUNCER_MAX_CLIENT_CONN=1000
PGBOUNCER_POOL_MODE=transaction

# 3. Usar URL del pooler en tu app
DATABASE_URL=${{pgbouncer.DATABASE_URL}}?pgbouncer=true
```

### Prisma con PgBouncer

Actualizar `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // PgBouncer
  directUrl = env("DIRECT_URL")        // RDS directo (migraciones)
}
```

---

## B) CDN para Assets

### Opción 1: Cloudflare (Recomendado)

1. **Agregar dominio a Cloudflare**
2. **Configurar reglas de cache:**

```
# Cachear assets estáticos
/*.(js|css|png|jpg|svg|ico|woff2) 
  Cache: 1 month
  
# No cachear API
/api/*
  Cache: Bypass
  
# No cachear HTML dinámico  
/*
  Cache: Bypass
```

3. **Activar compresión Brotli**

### Opción 2: Vercel Edge (si migras a Vercel)

```javascript
// next.config.js
module.exports = {
  images: {
    domains: ['res.cloudinary.com'],
    // Vercel optimiza automáticamente
  },
  headers: async () => [{
    source: '/:all*(svg|jpg|png|js|css)',
    headers: [{
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable'
    }]
  }]
}
```

### Assets ya en Cloudinary

Las imágenes de productos ya están en Cloudinary CDN:
- `https://res.cloudinary.com/CLOUD_NAME/image/upload/...`

---

## C) Workers Separados

### SUNAT Worker (ya implementado)

Ubicación: `src/worker/sunatWorker.ts`

```typescript
// Configuración actual
const POLL_INTERVAL = 10000;     // 10 segundos
const MAX_CONCURRENT_JOBS = 3;   // 3 jobs en paralelo
```

### Cómo ejecutar el worker

**Desarrollo:**
```bash
npm run sunat:worker
```

**Producción (Render):**
- Crear Background Worker
- Start Command: `npm run sunat:worker`
- Health Check: No requerido para workers

**Producción (Railway):**
```yaml
# railway.toml
[deploy]
  numReplicas = 1
  startCommand = "npm run sunat:worker"
```

### Reintentos con Backoff

El worker ya implementa:

```typescript
// En processSunatJob.ts
const RETRY_DELAYS = [
  1 * 60 * 1000,   // 1 minuto
  5 * 60 * 1000,   // 5 minutos  
  15 * 60 * 1000,  // 15 minutos
  60 * 60 * 1000,  // 1 hora
];
```

### Arquitectura Multi-Worker

Para alto volumen:

```
┌─────────────────┐
│  Next.js App    │ ◄── Checkout (no espera SUNAT)
└────────┬────────┘
         │ Encola job
         ▼
┌─────────────────┐
│   PostgreSQL    │ ◄── sunat_jobs table
└────────┬────────┘
         │ Polling
         ▼
┌─────────────────┐
│  SUNAT Worker 1 │ ◄── Procesa 3 jobs
├─────────────────┤
│  SUNAT Worker 2 │ ◄── Procesa 3 jobs (opcional)
└─────────────────┘
```

El worker usa `FOR UPDATE SKIP LOCKED` para evitar duplicados.

---

## Checklist de Rollout

### Fase 1: Preparación (1-5 tiendas)

- [ ] Verificar `connection_limit=10` en DATABASE_URL
- [ ] Confirmar índices de DB aplicados (`npx prisma db push`)
- [ ] Health check funcionando (`/api/health?deep=true`)
- [ ] Logs estructurados activados
- [ ] Backup automático configurado en RDS

### Fase 2: Optimización (5-10 tiendas)

- [ ] Monitorear conexiones DB (`scripts/monitor-db.ts`)
- [ ] Activar Cloudflare (DNS + cache)
- [ ] Configurar UptimeRobot/BetterStack
- [ ] Revisar rate limits (aumentar si necesario)
- [ ] SUNAT worker en proceso separado

### Fase 3: Escalado (10-20 tiendas)

- [ ] Implementar PgBouncer
- [ ] Actualizar Prisma con `directUrl`
- [ ] Aumentar RDS a t3.small (más conexiones)
- [ ] Segundo SUNAT worker si hay backlog
- [ ] Alertas en Sentry para errores

### Fase 4: Alto Volumen (20+ tiendas)

- [ ] Considerar RDS Aurora Serverless
- [ ] Redis para caché de session
- [ ] Múltiples regiones (si aplica)
- [ ] Load balancer para workers

---

## Métricas a Monitorear

### Base de Datos

```sql
-- Conexiones activas
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Queries lentas (>1s)
SELECT count(*) FROM pg_stat_statements WHERE mean_time > 1000;

-- Tamaño de tablas principales
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
```

### Aplicación

| Métrica | Alerta si... |
|---------|--------------|
| Latencia checkout | > 3 segundos |
| Error rate | > 1% |
| DB connections | > 80% del límite |
| SUNAT queue size | > 100 pending |
| Memory usage | > 512MB |

### Script de monitoreo

```bash
# Ejecutar diagnóstico completo
npx ts-node scripts/monitor-db.ts
```

---

## Costos Estimados

### Para 10 tiendas

| Servicio | Costo/mes |
|----------|-----------|
| Render Web Service | $7/mes |
| Render Worker (SUNAT) | $7/mes |
| AWS RDS db.t3.micro | ~$15/mes |
| Cloudinary (Free tier) | $0 |
| Cloudflare (Free) | $0 |
| **Total** | ~$30/mes |

### Para 20+ tiendas

| Servicio | Costo/mes |
|----------|-----------|
| Render Web (Starter+) | $14/mes |
| Render Worker | $7/mes |
| AWS RDS db.t3.small | ~$30/mes |
| PgBouncer (Railway) | $5/mes |
| Sentry (Team) | $26/mes |
| **Total** | ~$82/mes |

---

## Archivos Relacionados

| Archivo | Propósito |
|---------|-----------|
| `src/infra/db/prisma.ts` | Cliente Prisma con pooling |
| `src/worker/sunatWorker.ts` | Worker SUNAT separado |
| `AWS_RDS_SETUP_GUIDE.md` | Configuración RDS |
| `RENDER_DEPLOYMENT.md` | Deploy en Render |
| `scripts/monitor-db.ts` | Monitoreo de conexiones |

---

## Fecha

- Documentado: Febrero 2025
- Módulo: S10 — Infra Escalado
