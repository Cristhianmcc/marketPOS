# MÓDULO S9 — Observabilidad

## Resumen

Sistema de observabilidad para detectar errores en producción y medir performance sin invadir datos personales.

## A) Sentry - Error Tracking

### Estado: Preparado (no instalado)

La configuración está lista en `src/lib/sentry.ts`. Para activar:

```bash
npm install @sentry/nextjs
```

Luego configurar en `.env`:
```env
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Características
- Captura de errores sin PII
- Contexto: storeId, userId, requestId (IDs, no nombres/emails)
- Performance tracing en endpoints críticos
- Sample rate 10% para no saturar

### Endpoints con Tracing
- `/api/sales/checkout`
- `/api/backups/restore`
- `/api/backups/export`
- `/api/sunat/emit`
- `/api/auth/login`

### Uso
```typescript
import { captureError, startTransaction } from '@/lib/sentry';

// Capturar error
try {
  await riskyOperation();
} catch (error) {
  captureError(error, { storeId, userId, action: 'CHECKOUT' });
}

// Medir performance
const transaction = startTransaction('checkout', { storeId });
try {
  await processCheckout();
  transaction.finish();
} catch (error) {
  transaction.setStatus('error');
  transaction.finish();
}
```

## B) Logs Estructurados

### Archivo: `src/lib/logger.ts`

Logger que produce JSON estructurado en producción y formato legible en desarrollo.

### Campos estándar
| Campo | Descripción |
|-------|-------------|
| `timestamp` | ISO 8601 |
| `level` | debug, info, warn, error |
| `requestId` | ID único para correlación |
| `storeId` | ID de tienda (no nombre) |
| `userId` | ID de usuario (no email) |
| `action` | Acción ejecutada |
| `durationMs` | Duración en ms |

### Uso
```typescript
import { logger, generateRequestId, withTiming } from '@/lib/logger';

const requestId = generateRequestId();

// Log simple
logger.info('Checkout started', { requestId, storeId, userId });

// Log con timing automático
const { result, durationMs } = await withTiming(
  () => processCheckout(),
  { requestId, storeId, action: 'CHECKOUT' }
);
```

### Salida en Producción (JSON)
```json
{
  "timestamp": "2025-02-06T10:30:00.000Z",
  "level": "info",
  "message": "CHECKOUT completed",
  "context": {
    "requestId": "abc123xyz",
    "storeId": "store-uuid",
    "userId": "user-uuid",
    "durationMs": 245
  }
}
```

### Salida en Desarrollo
```
[2025-02-06T10:30:00.000Z] [INFO] [abc123xyz] CHECKOUT completed storeId=store-uuid durationMs=245
```

## C) Uptime Monitoring

### Endpoint: `/api/health`

| Parámetro | Descripción |
|-----------|-------------|
| `GET /api/health` | Check básico (API running) |
| `GET /api/health?deep=true` | Check profundo (incluye DB) |

### Respuesta OK (200)
```json
{
  "status": "ok",
  "timestamp": "2025-02-06T10:30:00.000Z",
  "version": "0.1.0",
  "uptime": 3600,
  "checks": {
    "api": "ok",
    "database": "ok"
  },
  "latency": {
    "database": 5
  }
}
```

### Respuesta Degraded (503)
```json
{
  "status": "degraded",
  "checks": {
    "api": "ok",
    "database": "error"
  }
}
```

### Configurar UptimeRobot/BetterStack

1. Crear cuenta en [UptimeRobot](https://uptimerobot.com) (gratis)
2. Agregar monitor:
   - URL: `https://tudominio.com/api/health?deep=true`
   - Intervalo: 5 minutos
   - Alerta: Email/Slack/Telegram

## Archivos Creados

| Archivo | Propósito |
|---------|-----------|
| `src/lib/logger.ts` | Logger estructurado con requestId |
| `src/lib/sentry.ts` | Configuración Sentry (preparada) |
| `src/app/api/health/route.ts` | Health check mejorado |

## Reglas de Seguridad (NO PII)

| Sí Loguear | NO Loguear |
|------------|------------|
| storeId | storeName |
| userId | userName, email |
| saleId | customerName |
| requestId | passwords |
| durationMs | tokens |
| action | direcciones |

## Integración con Sistema Existente

El sistema ya tiene:
- `AuditLog` para auditoría de negocio (ventas, shifts, etc.)
- `console.error` en endpoints críticos

Este módulo agrega:
- `logger` para logs estructurados correlacionados
- `Sentry` para error tracking en producción
- `health` mejorado para uptime monitoring

## Fecha

- Implementado: Febrero 2025
- Módulo: S9 — Observabilidad
