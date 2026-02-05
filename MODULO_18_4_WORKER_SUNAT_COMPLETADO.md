# ✅ MÓDULO 18.4 — WORKER + ENVÍO SUNAT BETA + RETRIES + POLLING COMPLETADO

**Fecha de finalización**: 2 de Febrero, 2026  
**Estado**: ✅ COMPLETADO

---

## 📋 RESUMEN EJECUTIVO

Este módulo implementa el **sistema de envío asíncrono de comprobantes electrónicos a SUNAT** mediante:

1. **Cola de jobs** con `SunatJob` (QUEUED → procesamiento → DONE/FAILED)
2. **Worker independiente** que procesa jobs cada 10 segundos
3. **Cliente SOAP** para comunicación con SUNAT BETA (SEE)
4. **Reintentos automáticos** con backoff exponencial (1min → 5min → 15min → 60min → 120min)
5. **Procesamiento del CDR** (Constancia de Recepción)
6. **Endpoints de encolado** (`/queue`, `/retry`)

### ⚠️ REGLA CRÍTICA CUMPLIDA

**Checkout NO espera a SUNAT**. Los documentos se encolan y el worker los procesa de forma asíncrona. Si SUNAT cae, el documento queda en ERROR con reintentos automáticos.

---

## 🎯 OBJETIVOS LOGRADOS

- ✅ Envío asíncrono de comprobantes (FACTURA, BOLETA, NC, ND)
- ✅ Worker loop que procesa jobs cada 10s
- ✅ Locking de jobs para evitar doble procesamiento
- ✅ Backoff exponencial con 5 intentos máximo
- ✅ Construcción de ZIP con XML firmado
- ✅ Cliente SOAP SUNAT (sendBill, sendSummary, getStatus)
- ✅ Parsing de CDR (responseCode, description, notes)
- ✅ Actualización de estado según respuesta SUNAT (ACCEPTED/REJECTED)
- ✅ Endpoints de encolado (/queue, /retry)
- ✅ Auditoría completa sin secretos
- ✅ Soporte para BETA y PROD (actualmente BETA)

---

## 📁 ARCHIVOS CREADOS/MODIFICADOS

### **Nuevos archivos (7)**

1. **src/lib/sunat/zip/buildZip.ts** (115 líneas)
   - `buildZip()`: Crea ZIP con XML firmado
   - `extractFromZip()`: Extrae contenido de ZIP (CDR)
   - `buildSunatFilename()`: Genera nombre estándar SUNAT
   - `mapDocTypeToSunatCode()`: FACTURA→01, BOLETA→03, etc.

2. **src/lib/sunat/soap/sunatClient.ts** (261 líneas)
   - `sendBill()`: Envío de comprobantes (CPE)
   - `sendSummary()`: Envío de resúmenes diarios (18.6)
   - `getStatus()`: Consulta de ticket
   - Endpoints BETA y PROD
   - Manejo de errores SOAP y de red

3. **src/lib/sunat/cdr/parseCdr.ts** (162 líneas)
   - `parseCdr()`: Parsea CDR ZIP de SUNAT
   - `isAcceptedBysunat()`: Valida código de respuesta
   - `getStatusMessage()`: Mensajes descriptivos (0000, 2000, 2300, etc.)
   - Extracción de ResponseCode, Description, Notes

4. **src/lib/sunat/process/processSunatJob.ts** (369 líneas)
   - `processSunatJob()`: Pipeline principal
   - `processSendCpe()`: Envío de FACTURA/BOLETA/NC/ND
   - `lockJob()`: Locking con `lockedAt`/`lockedBy`
   - `markJobFailed()`: Backoff exponencial
   - `validateJobExecution()`: Validaciones pre-envío
   - Actualización de documento según CDR

5. **src/worker/sunatWorker.ts** (227 líneas)
   - Loop cada 10 segundos
   - Procesa hasta 3 jobs concurrentes
   - Graceful shutdown (SIGTERM/SIGINT)
   - Health check cada 1 minuto
   - Logs sin secretos

6. **src/app/api/sunat/documents/[id]/queue/route.ts** (146 líneas)
   - POST: Encola documento SIGNED
   - Validaciones: auth, permisos, ENABLE_SUNAT, status
   - Previene duplicados (job QUEUED/DONE existente)
   - Auditoría: SUNAT_JOB_QUEUED

7. **src/app/api/sunat/documents/[id]/retry/route.ts** (159 líneas)
   - POST: Reintenta documentos ERROR/REJECTED
   - Resetea intentos a 0
   - Actualiza documento a PENDING
   - Auditoría: SUNAT_JOB_RETRY_QUEUED

### **Archivos modificados (2)**

8. **src/domain/sunat/audit.ts** (+169 líneas)
   - `auditSunatJobQueued()`
   - `auditSunatJobStarted()`
   - `auditSunatJobSuccess()`
   - `auditSunatJobFailed()`
   - `auditSunatCdrReceived()`

9. **package.json** (+1 línea)
   - Script: `"sunat:worker": "tsx src/worker/sunatWorker.ts"`

---

## 🔧 DEPENDENCIAS INSTALADAS

```bash
npm install soap adm-zip @types/adm-zip
```

- **soap**: Cliente SOAP para web services de SUNAT
- **adm-zip**: Generación y extracción de archivos ZIP
- **@types/adm-zip**: Tipos TypeScript para adm-zip

---

## 🔄 FLUJO COMPLETO

### 1. Documento SIGNED → Encolar
```http
POST /api/sunat/documents/:id/queue
Authorization: Bearer {token}
```

**Respuesta**:
```json
{
  "success": true,
  "message": "Documento encolado para envío a SUNAT",
  "job": {
    "id": "cml...",
    "status": "QUEUED",
    "type": "SEND_CPE",
    "nextRunAt": "2026-02-02T10:00:00Z"
  }
}
```

### 2. Worker procesa job

**Worker loop** (cada 10s):
1. Busca jobs QUEUED con `nextRunAt <= now`
2. Lockea job (`lockedAt`, `lockedBy`)
3. Carga documento y configuración SUNAT
4. Construye ZIP con XML firmado
5. Envía a SUNAT vía SOAP (`sendBill`)
6. Parsea CDR
7. Actualiza documento:
   - **ACCEPTED** si código empieza con "0"
   - **REJECTED** si código NO empieza con "0"
8. Actualiza job:
   - **DONE** si éxito
   - **QUEUED** con backoff si error y attempts < 5
   - **FAILED** si attempts >= 5

### 3. Reintentos automáticos

**Backoff exponencial**:
- Attempt 0 → +1 minuto
- Attempt 1 → +5 minutos
- Attempt 2 → +15 minutos
- Attempt 3 → +60 minutos
- Attempt 4 → +120 minutos
- Attempt 5 → FAILED (definitivo)

### 4. Reintento manual

```http
POST /api/sunat/documents/:id/retry
Authorization: Bearer {token}
```

Solo para documentos **ERROR** o **REJECTED**. Resetea `attempts` a 0.

---

## 📊 ESTRUCTURA DE DATOS

### SunatJob

```typescript
{
  id: string
  documentId: string
  storeId: string
  type: 'SEND_CPE' | 'SEND_SUMMARY' | 'QUERY_TICKET'
  status: 'QUEUED' | 'DONE' | 'FAILED'
  attempts: number
  lastError: string | null
  nextRunAt: DateTime
  lockedAt: DateTime | null
  lockedBy: string | null
  completedAt: DateTime | null
  createdAt: DateTime
  updatedAt: DateTime
}
```

### ElectronicDocument (campos actualizados)

```typescript
{
  ...
  status: 'DRAFT' | 'PENDING' | 'SIGNED' | 'ACCEPTED' | 'REJECTED' | 'ERROR'
  cdrZip: string | null           // CDR en Base64
  sunatCode: string | null         // Código respuesta (ej: "0000")
  sunatMessage: string | null      // Descripción del CDR
  sunatResponseAt: DateTime | null // Fecha de respuesta SUNAT
  zipSentBase64: string | null     // ZIP enviado (solo dev)
}
```

---

## 🔐 SEGURIDAD

### ✅ Reglas cumplidas

- **NO se loguean secretos**: `solPass`, `certPassword` nunca en logs ni auditoría
- **NO se loguean XMLs completos**: Solo longitudes y hashes
- **NO se loguean CDRs completos**: Solo códigos y mensajes
- **Locking de jobs**: Previene doble procesamiento
- **Timeouts SOAP**: 30 segundos por request
- **Validación de credenciales**: Formato usuario SOL (RUC + usuario)

---

## 🧪 CHECKLIST DE PRUEBAS

### ✅ Prueba 1: Encolado normal

1. Crear documento DRAFT
2. Generar XML (`POST /api/sunat/documents/:id/build-xml`)
3. Firmar XML (`POST /api/sunat/documents/:id/sign`)
4. Encolar (`POST /api/sunat/documents/:id/queue`)
5. Verificar job creado: `status=QUEUED`, `nextRunAt=now`

### ✅ Prueba 2: Worker procesa job

1. Iniciar worker: `npm run sunat:worker`
2. Worker toma job QUEUED
3. Envía a SUNAT BETA
4. Recibe CDR
5. Actualiza documento: `status=ACCEPTED`, `sunatCode=0000`
6. Actualiza job: `status=DONE`

### ✅ Prueba 3: Error de red → Reintentos

1. Desconectar red o credenciales incorrectas
2. Job falla, `status=QUEUED`, `attempts=1`, `nextRunAt=+1min`
3. Worker reintenta después de 1 minuto
4. Si falla 5 veces → `status=FAILED`, documento `status=ERROR`

### ✅ Prueba 4: Reintento manual

1. Documento en `status=ERROR`
2. POST `/retry` → crea nuevo job con `attempts=0`
3. Documento actualizado a `PENDING`
4. Worker procesa nuevamente

### ✅ Prueba 5: Rechazo SUNAT

1. Enviar documento con error (ej: RUC inválido)
2. SUNAT devuelve CDR con código 2000+
3. Documento actualizado a `REJECTED`
4. `sunatCode` y `sunatMessage` guardados

### ✅ Prueba 6: Checkout NO bloqueado

1. Hacer venta normal
2. Verificar que checkout NO espera a SUNAT
3. Documento se encola en background
4. Worker procesa asíncronamente

---

## 🚀 DEPLOY EN RENDER

### 1. Configurar Background Worker

En Render Dashboard:

1. **Crear nuevo Background Worker**
   - Name: `market-pos-sunat-worker`
   - Environment: Same as Web Service
   - Build Command: `npm install && npx prisma generate`
   - Start Command: `npm run sunat:worker`

2. **Variables de entorno**:
   ```bash
   ENABLE_SUNAT=true
   DATABASE_URL={mismo que web service}
   ```

3. **Health check**: Worker loguea stats cada 1 minuto

### 2. Monitoreo

**Logs del worker**:
```
[sunat-worker-12345] 🚀 SUNAT Worker iniciado
[sunat-worker-12345] ⏱️  Polling cada 10s
[sunat-worker-12345] 🔄 Max 3 jobs concurrentes

[sunat-worker-12345] 📋 2 job(s) encontrado(s)
[sunat-worker-12345] ▶️  Procesando job cml62...
[sunat-worker-12345] ✅ Job cml62 completado en 2341ms
   → Documento accepted: La Factura numero F001-00000123, ha sido aceptada

[sunat-worker-12345] 💚 Health check:
   → Jobs activos: 1/3
   → QUEUED: 5, DONE: 120, FAILED: 2
```

### 3. Scaling

- **1 worker** es suficiente para ~500 docs/día
- **2-3 workers** para volúmenes mayores
- Cada worker procesa hasta 3 jobs concurrentes

---

## 📝 LOGS Y AUDITORÍA

### Eventos registrados

| Evento | Action | Severity | Meta |
|--------|--------|----------|------|
| Job encolado | `SUNAT_JOB_QUEUED` | INFO | jobId, docType, fullNumber |
| Reintento encolado | `SUNAT_JOB_RETRY_QUEUED` | INFO | jobId, previousError |
| Job iniciado | `SUNAT_JOB_STARTED` | INFO | jobId, attempts |
| Job exitoso | `SUNAT_JOB_SUCCESS` | INFO | sunatCode, sunatMessage |
| Job fallido | `SUNAT_JOB_FAILED` | WARNING/ERROR | errorCode, willRetry |
| CDR aceptado | `SUNAT_CDR_ACCEPTED` | INFO | responseCode, description |
| CDR rechazado | `SUNAT_CDR_REJECTED` | ERROR | responseCode, notes |

### ✅ NO se loguea NUNCA

- `solPass`
- `certPassword`
- XML completo
- CDR completo (solo códigos/mensajes)
- `privateKey`
- Detalles de red internos

---

## 🔄 PRÓXIMOS MÓDULOS

- **18.5**: Procesamiento avanzado de CDR y almacenamiento
- **18.6**: Resúmenes Diarios y Comunicaciones de Baja
- **18.7**: Cambio a PRODUCCIÓN
- **18.8**: Integración con checkout (encolar automáticamente)

---

## ✅ CONFIRMACIÓN: NO SE TOCÓ CHECKOUT/POS

**Archivos NO modificados**:
- ❌ `src/app/pos/**`
- ❌ `src/app/checkout/**`
- ❌ `src/lib/promotions/**`
- ❌ `src/lib/shifts/**`
- ❌ `src/lib/fiado/**`

**El módulo es 100% aislado**. Solo consume `ElectronicDocument` firmados.

---

## 🎯 RESUMEN TÉCNICO

| Aspecto | Detalle |
|---------|---------|
| **Archivos nuevos** | 7 |
| **Archivos modificados** | 2 |
| **Líneas de código** | ~1,608 |
| **Dependencias** | soap, adm-zip |
| **Endpoints** | 2 (queue, retry) |
| **Worker** | 1 background process |
| **Max intentos** | 5 |
| **Backoff** | 1m → 5m → 15m → 60m → 120m |
| **Concurrencia** | 3 jobs simultáneos |
| **Polling** | 10 segundos |
| **Timeout SOAP** | 30 segundos |
| **Environment** | BETA (configurable a PROD) |

---

## 🏁 CONCLUSIÓN

El **MÓDULO 18.4 está completo y funcional**. El sistema de envío asíncrono a SUNAT está listo para:

1. ✅ Encolar documentos firmados
2. ✅ Procesar jobs con worker independiente
3. ✅ Enviar a SUNAT BETA vía SOAP
4. ✅ Procesar CDR y actualizar estados
5. ✅ Reintentar automáticamente con backoff
6. ✅ Reintento manual de documentos fallidos
7. ✅ Auditoría completa sin secretos
8. ✅ Deploy en Render como Background Worker

**El checkout NO espera a SUNAT**. Todo es asíncrono. 🚀
