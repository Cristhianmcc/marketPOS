# MÓDULO S8 — Security Hardening

## Resumen

Protección de endpoints críticos mediante rate limiting sin afectar operación normal.

## A) Rate Limit Login

**Endpoint:** `/api/auth/login`

| Configuración | Valor |
|---------------|-------|
| Intentos máximos | 5 |
| Ventana de tiempo | 5 minutos (300s) |
| Error HTTP | 429 TOO_MANY_REQUESTS |
| Código | `TOO_MANY_ATTEMPTS` |

### Comportamiento
1. Cada intento de login (exitoso o fallido) consume 1 token
2. Al agotar tokens → respuesta 429 con `Retry-After` header
3. Login exitoso → resetea contador para esa IP
4. Se registra en AuditLog con severity WARN

### Headers de respuesta (429)
```
Retry-After: <segundos>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <timestamp>
```

## B) Rate Limit Admin Sensible

### Endpoints protegidos

| Endpoint | Max Requests | Ventana |
|----------|-------------|---------|
| `/api/backups/export` | 3 | 60s |
| `/api/backups/restore/new-store` | 1 | 120s |
| `/api/admin/stores` (POST) | 3 | 60s |
| `/api/admin/users` (POST) | 5 | 60s |
| `/api/sunat/emit` | 10 | 60s |

### Lógica
- Rate limit por IP del cliente
- Soporta proxies (X-Forwarded-For, X-Real-IP)
- Cache en memoria (Map) con limpieza automática cada 60s

## C) CORS

**Estado:** Same-origin (no requiere configuración adicional)

La aplicación es 100% same-origin:
- Frontend y API en mismo dominio
- No hay llamadas cross-origin
- Next.js maneja automáticamente

Si en futuro se necesita CORS stricto, agregar en `next.config.js`:
```js
async headers() {
  return [{
    source: '/api/:path*',
    headers: [
      { key: 'Access-Control-Allow-Origin', value: process.env.ALLOWED_ORIGINS || 'https://tudominio.com' },
      { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE' },
    ]
  }]
}
```

## Archivos Modificados

### Core
- `src/lib/rateLimit.ts` - Configuraciones y helper `getClientIP()`

### Endpoints protegidos
- `src/app/api/auth/login/route.ts` - Rate limit + AuditLog
- `src/app/api/backups/export/route.ts` - Rate limit
- `src/app/api/backups/restore/new-store/route.ts` - Rate limit + AuditLog
- `src/app/api/admin/stores/route.ts` - Rate limit POST
- `src/app/api/admin/users/route.ts` - Rate limit POST
- `src/app/api/sunat/emit/route.ts` - Rate limit

## Configuración Rate Limits

```typescript
// src/lib/rateLimit.ts
export const RATE_LIMITS = {
  // Login protection
  'login': { maxRequests: 5, windowSeconds: 300 },
  
  // Admin sensitive
  'backup-export': { maxRequests: 3, windowSeconds: 60 },
  'backup-restore': { maxRequests: 1, windowSeconds: 120 },
  'admin-store-create': { maxRequests: 3, windowSeconds: 60 },
  'admin-user-create': { maxRequests: 5, windowSeconds: 60 },
  'sunat': { maxRequests: 10, windowSeconds: 60 },
  
  // Existing
  'checkout': { maxRequests: 5, windowSeconds: 10 },
  'cancel': { maxRequests: 3, windowSeconds: 30 },
  // ...
};
```

## Testing

### Probar rate limit login
```bash
# 6 intentos rápidos deberían bloquear
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo ""
done
```

### Verificar AuditLog
```sql
SELECT * FROM audit_logs 
WHERE action = 'LOGIN_RATE_LIMIT_EXCEEDED' 
ORDER BY created_at DESC 
LIMIT 10;
```

## Notas de Seguridad

1. **Sin romper operación:** Rate limits son generosos para uso normal
2. **IP-based:** Puede ser evadido con VPN/proxies, pero protege de ataques simples
3. **En memoria:** Se pierde al reiniciar servidor (aceptable para este caso)
4. **Producción:** Considerar Redis para persistencia y escalabilidad multi-instancia

## Fecha

- Implementado: Febrero 2025
- Módulo: S8 — Security Pro
