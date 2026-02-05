# MÓDULO 18.6 — RESUMEN DIARIO + COMUNICACIÓN DE BAJA

**Estado:** ✅ COMPLETADO  
**Fecha:** 2025-02-04

---

## 🎯 Objetivo

Implementar el envío diferido de Resumen Diario de Boletas (RC) y Comunicación de Baja (RA) a SUNAT, sin modificar el flujo de venta ni la cancelación local.

---

## 📁 Archivos Creados/Modificados

### Schema Prisma
- `prisma/schema.prisma`
  - ✅ Agregados modelos: `SunatSettings`, `ElectronicDocument`, `SunatJob`
  - ✅ Agregados enums: `SunatDocType`, `SunatStatus`, `SunatEnv`, `CustomerDocType`
  - ✅ Agregado `ENABLE_SUNAT` a `FeatureFlagKey`
  - ✅ Agregado `SUNAT` a `AuditEntityType`
  - ✅ Nuevos campos para 18.6:
    - `reportedInSummary` - Boletas incluidas en un resumen
    - `referenceDocId` - Referencia al documento original (para VOIDED)
    - `voidReason` - Razón de baja
    - `defaultSummarySeries` / `nextSummaryNumber`
    - `defaultVoidedSeries` / `nextVoidedNumber`

### Migración
- `prisma/migrations/20260204164738_add_sunat_summary_voided_fields/migration.sql`
  - Agregados campos de Summary y Voided al schema existente

### XML Builders (UBL)
- `src/lib/sunat/ubl/summary.ts` ✅ NUEVO
  - Genera XML para Resumen Diario (RC)
  - Formato: `RC-YYYYMMDD-NNNNN`
  - Máximo 500 documentos por resumen
  
- `src/lib/sunat/ubl/voided.ts` ✅ NUEVO
  - Genera XML para Comunicación de Baja (RA)
  - Formato: `RA-YYYYMMDD-NNNNN`
  
- `src/lib/sunat/ubl/types.ts` ✅ MODIFICADO
  - Agregados namespaces para Summary y Voided
  - Agregados catálogos 12 (tipo documento resumen) y 19 (estado item)

### Worker/Procesador
- `src/lib/sunat/process/processSunatJob.ts` ✅ MODIFICADO
  - ✅ Implementado `processSendSummary()` - Envía Summary/Voided vía sendSummary
  - ✅ Implementado `processQueryTicket()` - Consulta estado de ticket
  - Manejo de código 98 (en proceso) con re-encolado
  - Código 0 = Aceptado, 99+ = Rechazado
  - Marcado de boletas como reportadas en summary

### API Endpoints
- `src/app/api/sunat/summary/run/route.ts` ✅ NUEVO
  - POST: Genera y envía Resumen Diario para una fecha
  - GET: Lista boletas pendientes de reportar
  
- `src/app/api/sunat/void/route.ts` ✅ NUEVO
  - POST: Genera y envía Comunicación de Baja
  - GET: Lista documentos que pueden ser anulados

### Auditoría
- `src/domain/sunat/audit.ts` ✅ MODIFICADO
  - `auditSunatSummaryCreated()` - Creación de resumen
  - `auditSunatSummaryAccepted()` - Resumen aceptado
  - `auditSunatSummaryRejected()` - Resumen rechazado
  - `auditSunatVoidedCreated()` - Creación de baja
  - `auditSunatVoidedAccepted()` - Baja aceptada
  - `auditSunatVoidedRejected()` - Baja rechazada
  - `auditSunatTicketPolled()` - Consulta de ticket

---

## 🔄 Flujos Implementados

### Resumen Diario (RC)

```
1. POST /api/sunat/summary/run { referenceDate: "2025-02-04" }
2. Buscar boletas ACCEPTED del día no reportadas
3. Generar XML Summary con hasta 500 boletas
4. Firmar XML con certificado digital
5. Crear ElectronicDocument tipo SUMMARY
6. Encolar job SEND_SUMMARY
7. Worker: sendSummary() → ticket
8. Crear job QUERY_TICKET (1 min después)
9. Worker: getStatus() 
   - 98 → Re-encolar 2 min después
   - 0 → ACCEPTED, marcar boletas como reportadas
   - 99+ → REJECTED
```

### Comunicación de Baja (RA)

```
1. POST /api/sunat/void { documentIds: [...], voidReason: "..." }
2. Validar documentos (ACCEPTED, no anulados)
3. Generar XML Voided
4. Firmar XML con certificado digital
5. Crear ElectronicDocument tipo VOIDED
6. Encolar job SEND_SUMMARY (mismo servicio)
7. Worker: sendSummary() → ticket
8. Crear job QUERY_TICKET
9. Worker: getStatus()
   - 0 → Marcar originales como CANCELED
   - 99+ → REJECTED
```

---

## 📋 API Reference

### POST /api/sunat/summary/run

Genera y envía Resumen Diario.

**Permisos:** Solo OWNER

**Request:**
```json
{
  "referenceDate": "2025-02-04"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Resumen Diario creado con 15 boletas",
  "summary": {
    "id": "clu...",
    "fullNumber": "20123456789-RC01-20250204-00001",
    "referenceDate": "2025-02-04",
    "boletasCount": 15,
    "totalAmount": "1234.50",
    "status": "SIGNED",
    "jobId": "clu..."
  }
}
```

### GET /api/sunat/summary/run?referenceDate=2025-02-04

Lista boletas pendientes de reportar.

**Response:**
```json
{
  "referenceDate": "2025-02-04",
  "pendingCount": 25,
  "maxPerSummary": 500,
  "boletas": [
    {
      "id": "...",
      "fullNumber": "B001-00000123",
      "total": "45.00",
      "customerName": "CLIENTE GENERICO"
    }
  ]
}
```

### POST /api/sunat/void

Genera y envía Comunicación de Baja.

**Permisos:** Solo OWNER

**Request:**
```json
{
  "documentIds": ["doc1", "doc2"],
  "voidReason": "Error en datos del cliente"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Comunicación de Baja creada para 2 documento(s)",
  "voided": {
    "id": "...",
    "fullNumber": "20123456789-RA01-20250204-00001",
    "documentsCount": 2,
    "documentsAffected": ["F001-00000001", "B001-00000002"],
    "voidReason": "Error en datos del cliente",
    "status": "SIGNED",
    "jobId": "..."
  }
}
```

### GET /api/sunat/void

Lista documentos que pueden ser anulados.

**Query params:**
- `docType`: Filtrar por tipo (FACTURA, BOLETA, etc.)
- `page`, `limit`: Paginación

---

## ✅ Validaciones Implementadas

1. **Solo BETA permitido** - PROD bloqueado hasta Módulo 18.7
2. **Solo OWNER** puede ejecutar Summary y Voided
3. **Máximo 500 documentos** por Summary/Voided
4. **Solo documentos ACCEPTED** pueden anularse
5. **Boletas ya reportadas** no se incluyen en nuevo Summary
6. **Certificado digital** requerido para firmar
7. **Credenciales SOL** requeridas para envío

---

## 🔒 Seguridad

- ✅ No se loguean credenciales SOL ni certificados en auditoría
- ✅ Solo OWNER puede ejecutar procesos fiscales
- ✅ PROD bloqueado hasta verificación manual
- ✅ Proceso asíncrono no afecta checkout

---

## 🧪 Testing Manual

```bash
# 1. Ver boletas pendientes
curl http://localhost:3000/api/sunat/summary/run?referenceDate=2025-02-04

# 2. Ejecutar resumen diario
curl -X POST http://localhost:3000/api/sunat/summary/run \
  -H "Content-Type: application/json" \
  -d '{"referenceDate": "2025-02-04"}'

# 3. Ver documentos anulables
curl http://localhost:3000/api/sunat/void

# 4. Dar de baja documento
curl -X POST http://localhost:3000/api/sunat/void \
  -H "Content-Type: application/json" \
  -d '{"documentIds": ["doc-id"], "voidReason": "Error en datos"}'
```

---

## 📌 Notas Importantes

1. **No modifica checkout** - El flujo de venta NO fue tocado
2. **Cancelación local independiente** - Módulo 11 sigue igual
3. **Worker procesa async** - No bloquea UI
4. **Backoff exponencial** - Reintentos con delay progresivo
5. **Ticket polling** - Consulta diferida (1-2 min)

---

## 🚀 Próximos Pasos (Módulo 18.7)

- [ ] Habilitar modo PROD con verificación
- [ ] UI mínima para ejecutar Summary desde dashboard
- [ ] Notificaciones de estado de documentos
- [ ] Reportes de documentos enviados/rechazados
