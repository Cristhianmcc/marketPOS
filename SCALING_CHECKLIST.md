# Checklist de Rollout - Escalado BodegaPOS

## Pre-Requisitos

- [ ] Acceso a AWS RDS / Railway / Render
- [ ] Dominio configurado (DNS)
- [ ] Cuenta Cloudflare (gratis)
- [ ] Credenciales de producción (SESSION_SECRET, SUPERADMIN_EMAILS)

---

## Fase 1: 1-5 Tiendas (Básico)

### Base de Datos
- [ ] RDS db.t3.micro creado (o PostgreSQL en Railway)
- [ ] `connection_limit=10` en DATABASE_URL
- [ ] `pool_timeout=20` configurado
- [ ] Backup automático activado (RDS: retention 7 días)

### Aplicación
- [ ] Deploy en Render/Railway funcionando
- [ ] Variables de entorno configuradas
- [ ] Health check pasando: `GET /api/health?deep=true`
- [ ] SSL/HTTPS activo

### Monitoreo
- [ ] UptimeRobot configurado (check cada 5 min)
- [ ] Email de alerta configurado

---

## Fase 2: 5-10 Tiendas (Optimización)

### Performance
- [ ] Índices de DB verificados (`npx prisma db push`)
- [ ] Rate limiting activo (MÓDULO S8)
- [ ] Logs estructurados (MÓDULO S9)

### CDN
- [ ] Cloudflare agregado al dominio
- [ ] Reglas de cache configuradas
- [ ] Compresión Brotli activada

### Worker SUNAT
- [ ] SUNAT worker deploy separado
- [ ] Logs del worker visibles
- [ ] Cola de jobs procesándose (< 10 pendientes normal)

### Base de Datos
- [ ] Monitoreo de conexiones configurado
- [ ] Alertas si conexiones > 80%
- [ ] Query time promedio < 100ms

---

## Fase 3: 10-20 Tiendas (Escalado)

### PgBouncer
- [ ] PgBouncer instalado (Railway/EC2)
- [ ] `DIRECT_URL` configurado para migraciones
- [ ] `?pgbouncer=true` en DATABASE_URL
- [ ] Test de migraciones funciona

### Base de Datos
- [ ] Upgrade a RDS db.t3.small (o equivalente)
- [ ] Verificar max_connections aumentado
- [ ] Índices optimizados para queries frecuentes

### Monitoreo Avanzado
- [ ] Sentry instalado y configurado
- [ ] Alertas de error rate > 1%
- [ ] Dashboard de métricas (opcional)

---

## Fase 4: 20+ Tiendas (Alto Volumen)

### Infraestructura
- [ ] Considerar Aurora Serverless
- [ ] Múltiples workers SUNAT (si backlog)
- [ ] Redis para session cache (opcional)

### Escalado Horizontal
- [ ] Auto-scaling configurado
- [ ] Load balancer (si múltiples instancias)
- [ ] Geo-distribución (si multi-región)

### Compliance
- [ ] Logs de auditoría retenidos 90+ días
- [ ] Backup cross-region (si crítico)
- [ ] DR plan documentado

---

## Comandos Útiles

```bash
# Verificar salud
curl https://tudominio.com/api/health?deep=true

# Monitorear DB
npx ts-node scripts/monitor-db.ts

# Ver conexiones activas
docker exec market-pos-db psql -U market_user -d market_pos_dev \
  -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Cola SUNAT pendiente
docker exec market-pos-db psql -U market_user -d market_pos_dev \
  -c "SELECT status, count(*) FROM sunat_jobs GROUP BY status;"
```

---

## Contactos de Emergencia

| Servicio | Soporte |
|----------|---------|
| AWS RDS | AWS Support (console) |
| Render | support@render.com |
| Railway | Discord / support@railway.app |
| Cloudflare | Dashboard + docs |

---

## Rollback

Si algo falla:

1. **DB corrupta**: Restaurar desde snapshot RDS
2. **App broken**: Revert a deployment anterior
3. **PgBouncer issues**: Apuntar DATABASE_URL directo a RDS
4. **Worker stuck**: Reiniciar worker, verificar logs

---

Fecha: Febrero 2025
Módulo: S10 — Infra Escalado
