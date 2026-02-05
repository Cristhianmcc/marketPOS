# MÓDULO 18.5 — UI SUNAT (EMITIR / ESTADO / DESCARGAS) EN POS Y VENTAS ✅

**Estado:** COMPLETADO  
**Fecha:** 2024-01-XX  
**Requisitos:** MÓDULO 18.1-18.4 completos, Next.js 15, React 18+

---

## 📋 RESUMEN

Este módulo integra la **interfaz de usuario** para la emisión, visualización y descarga de **comprobantes electrónicos SUNAT** en el sistema POS y en el historial de ventas.

### Características Principales

✅ **Selector de comprobante en checkout POS**
- BOLETA (DNI/CE) - Disponible para CASHIER
- FACTURA (RUC) - Solo OWNER/SUPERADMIN
- Inputs de datos del cliente (documento, nombre, dirección, email)
- Solo visible si `ENABLE_SUNAT=true` en configuración

✅ **Emisión asíncrona post-checkout**
- El comprobante se emite **DESPUÉS** de guardar la venta
- Si falla SUNAT, la venta YA está guardada (no afecta ACID)
- Worker procesa envío en segundo plano

✅ **Columna SUNAT en historial de ventas**
- Badge de estado (DRAFT/SIGNED/SENT/ACCEPTED/REJECTED/ERROR)
- Número de comprobante
- Código y mensaje de SUNAT
- Botones de acción contextua

les

✅ **Acciones disponibles**
- **Emitir:** Crear comprobante para venta sin comprobante
- **Reintentar:** Reenviar comprobantes ERROR o REJECTED
- **Descargar XML:** Archivo XML firmado
- **Descargar CDR:** Constancia de Recepción de SUNAT

✅ **Bloques importantes**
- FIADO: NO soporta emisión SUNAT (409 FIADO_NOT_SUPPORTED)
- Checkout nunca espera a SUNAT (sistema 100% asíncrono)
- Feature flag: `ENABLE_SUNAT` controla toda la UI

---

## 🏗️ ARQUITECTURA

### Endpoints API Nuevos

```
GET  /api/sunat/settings/status          → Estado de configuración SUNAT
GET  /api/sunat/by-sale/:saleId         → Documento electrónico por venta
POST /api/sunat/emit                     → Emitir comprobante (BOLETA/FACTURA)
GET  /api/sunat/documents/:id/download  → Descargar XML/CDR
```

### Componentes UI Nuevos

```
src/components/pos/SunatComprobanteSelector.tsx    → Selector en checkout POS
src/components/sunat/SunatStatusBadge.tsx          → Badge de estado SUNAT
src/components/sunat/SunatActions.tsx              → Botones de acción
```

### Archivos Modificados

```
src/app/pos/page.tsx         → Integración selector + emisión post-checkout
src/app/sales/page.tsx       → Columna SUNAT con estados y acciones
src/domain/sunat/audit.ts    → 4 nuevas funciones de auditoría
```

---

## 📝 FLUJO COMPLETO

### 1. **Checkout POS con Comprobante**

```
Usuario abre modal de pago
  → Selecciona método de pago (CASH/YAPE/PLIN/CARD)
    → Si ENABLE_SUNAT=true y paymentMethod≠FIADO:
      → Muestra SunatComprobanteSelector
        → Usuario marca "Emitir comprobante"
        → Selecciona BOLETA o FACTURA
          → FACTURA: Solo si userRole=OWNER/SUPERADMIN
        → Completa datos del cliente
  → Click "Confirmar"
    → POST /api/sales/checkout (venta se guarda ACID)
      → ✅ Venta exitosa (saleId retornado)
        → SI sunatData.enabled:
          → POST /api/sunat/emit
            → Crea ElectronicDocument DRAFT
            → Genera XML mock firmado
            → Marca SIGNED
            → Encola SunatJob QUEUED
            → Worker enviará en background
        → Toast: "Venta completada" + "Comprobante encolado"
        → clearCart() + reset estados
```

**CRÍTICO:** Si `POST /api/sunat/emit` falla, la venta YA está guardada. Se muestra warning: "Venta guardada, emite comprobante desde historial".

### 2. **Historial de Ventas con SUNAT**

```
Usuario abre /sales
  → fetchSales() → GET /api/sales
  → SI ENABLE_SUNAT:
    → fetchDocumentsData(saleIds)
      → Para cada venta: GET /api/sunat/by-sale/:saleId
      → Retorna: hasDocument, document{id, status, fullNumber, ...}
  → Renderiza tabla con columna SUNAT:
    → SunatStatusBadge (estado + código + mensaje)
    → Número de comprobante
    → SunatActions (botones contextuales)
```

### 3. **Acciones desde Historial**

**Emitir (si no tiene comprobante):**
```
Click "Emitir"
  → Modal con inputs (docType, customerDocType, customerDocNumber, customerName)
  → POST /api/sunat/emit
    → Valida permisos (FACTURA solo OWNER)
    → Valida FIADO (409 bloqueado)
    → Crea documento + encola job
    → Toast: "Comprobante encolado"
  → Reload documento
```

**Reintentar (si ERROR o REJECTED):**
```
Click "Reintentar"
  → POST /api/sunat/documents/:id/retry
    → Crea nuevo job attempts=0
    → Marca documento PENDING
    → Worker reintentará envío
```

**Descargar XML/CDR:**
```
Click "XML" o "CDR"
  → GET /api/sunat/documents/:id/download?type=xml|cdr
    → Retorna archivo con Content-Disposition
    → Audita descarga
    → Browser descarga archivo
```

---

## 🔒 REGLAS DE NEGOCIO

### Permisos por Rol

| Rol         | BOLETA | FACTURA | Reintentar | Descargar |
|-------------|--------|---------|------------|-----------|
| CASHIER     | ✅ Sí  | ❌ No   | ✅ Sí      | ✅ Sí     |
| OWNER       | ✅ Sí  | ✅ Sí   | ✅ Sí      | ✅ Sí     |
| SUPERADMIN  | ✅ Sí  | ✅ Sí   | ✅ Sí      | ✅ Sí     |

### Validaciones

**POST /api/sunat/emit:**
```javascript
1. saleId, docType, customerDocType, customerDocNumber, customerName requeridos
2. docType ∈ {BOLETA, FACTURA}
3. FACTURA → userRole ∈ {OWNER, SUPERADMIN} (403 si no)
4. paymentMethod ≠ FIADO (409 FIADO_NOT_SUPPORTED)
5. No debe tener documento SIGNED/SENT/ACCEPTED previo (409)
6. SUNAT enabled en tienda (400 si no)
7. Serie según docType (B001/F001 por defecto)
8. Correlativo = max(number) + 1 por serie
```

**Datos del Cliente:**
```javascript
// BOLETA
customerDocType: 'DNI' | 'CE' | 'PASAPORTE'
customerDocNumber: max 20 chars
customerName: required
customerAddress: optional
customerEmail: optional

// FACTURA
customerDocType: 'RUC' (forzado)
customerDocNumber: 11 dígitos
customerName: Razón Social (required)
customerAddress: optional (recomendado)
customerEmail: optional
```

### Estados de Documento

| Estado    | Descripción                       | Acciones Disponibles        |
|-----------|-----------------------------------|-----------------------------|
| DRAFT     | Creado, sin firmar                | -                           |
| SIGNED    | Firmado, pendiente envío          | Ver XML                     |
| SENT      | Enviado a SUNAT, esperando CDR    | Ver XML                     |
| ACCEPTED  | Aceptado por SUNAT ✅             | Ver XML, Descargar CDR      |
| REJECTED  | Rechazado por SUNAT ❌            | Ver XML, Reintentar         |
| ERROR     | Error técnico al enviar           | Reintentar                  |

---

## 🧪 CHECKLIST DE PRUEBAS

### Funcionales

- [ ] **F1:** Selector SUNAT visible solo si `ENABLE_SUNAT=true`
- [ ] **F2:** Selector oculto para método FIADO
- [ ] **F3:** CASHIER ve solo opción BOLETA
- [ ] **F4:** OWNER ve BOLETA y FACTURA
- [ ] **F5:** Emitir BOLETA desde POS genera documento + job QUEUED
- [ ] **F6:** Emitir FACTURA desde POS (OWNER) funciona
- [ ] **F7:** CASHIER no puede emitir FACTURA (botón deshabilitado)
- [ ] **F8:** Si SUNAT falla, venta se guarda igual (warning toast)
- [ ] **F9:** Checkout NO espera a SUNAT (asíncrono)
- [ ] **F10:** Columna SUNAT visible en /sales si enabled
- [ ] **F11:** Badge de estado correcto (colores + iconos)
- [ ] **F12:** Botón "Emitir" solo si no tiene documento
- [ ] **F13:** Botón "Reintentar" solo si ERROR/REJECTED
- [ ] **F14:** Descargar XML funciona
- [ ] **F15:** Descargar CDR funciona (solo si ACCEPTED)
- [ ] **F16:** Emitir desde historial crea comprobante retroactivo
- [ ] **F17:** FIADO muestra "Sin comprobante" (no botones)
- [ ] **F18:** Venta anulada no permite emitir comprobante

### Validaciones

- [ ] **V1:** POST /emit con FIADO → 409 FIADO_NOT_SUPPORTED
- [ ] **V2:** POST /emit FACTURA con CASHIER → 403
- [ ] **V3:** POST /emit sin customerName → 400
- [ ] **V4:** POST /emit con venta ya con comprobante → 409
- [ ] **V5:** DNI requiere 8 dígitos (validación UI)
- [ ] **V6:** RUC requiere 11 dígitos (validación UI)
- [ ] **V7:** FACTURA fuerza customerDocType=RUC
- [ ] **V8:** Serie se asigna automáticamente (B001/F001)
- [ ] **V9:** Correlativo incrementa correctamente

### Integración

- [ ] **I1:** Worker procesa job SUNAT después de emit
- [ ] **I2:** CDR recibido actualiza estado a ACCEPTED
- [ ] **I3:** Reintentar crea nuevo job con attempts=0
- [ ] **I4:** Auditoría registra: EMIT_REQUESTED, EMIT_SUCCESS, DOWNLOAD
- [ ] **I5:** Feature flag OFF oculta toda UI SUNAT
- [ ] **I6:** Actualizar documento en /sales recarga estado
- [ ] **I7:** Múltiples ventas cargan documentos en paralelo

### UI/UX

- [ ] **U1:** Selector se pliega/despliega al marcar checkbox
- [ ] **U2:** Hints de permisos visibles (FACTURA solo OWNER)
- [ ] **U3:** Advertencia "comprobante en segundo plano" clara
- [ ] **U4:** Toast diferenciado: venta OK vs comprobante error
- [ ] **U5:** Badge responsivo (no rompe layout móvil)
- [ ] **U6:** Botones de acción no se solapan
- [ ] **U7:** Modal de emitir desde historial UX clara
- [ ] **U8:** Descargas abren en nueva pestaña

---

## 📊 AUDITORÍA

### Nuevos Eventos

```typescript
// Emisión de comprobante
SUNAT_EMIT_REQUESTED  → Usuario solicita emitir comprobante
SUNAT_EMIT_SUCCESS    → Comprobante creado y encolado
SUNAT_EMIT_FAILED     → Error al emitir comprobante

// Descargas
SUNAT_DOWNLOAD        → Descarga de XML/CDR/PDF
```

### Metadata Registrada

```typescript
{
  saleId: string;
  docType: 'BOLETA' | 'FACTURA';
  fullNumber: string;
  customerDocType: string;
  customerDocNumber: string;
  documentId?: string;
  jobId?: string;
  errorMessage?: string;
  fileType?: 'XML' | 'CDR' | 'PDF';
}
```

**NUNCA se registran:** solPass, certPassword, XML/CDR completos.

---

## 🚀 DESPLIEGUE

### Variables de Entorno

```env
# Feature flag (ya existente de 18.1)
ENABLE_SUNAT=true

# Configuración SUNAT (18.1-18.3)
SUNAT_ENV=BETA
SUNAT_RUC=20123456789
SUNAT_SOL_USER=MODDATOS
SUNAT_SOL_PASS=moddatos
```

### Comandos

```bash
# Build
npm run build

# Worker (debe estar corriendo)
npm run sunat:worker

# Servidor
npm run dev
# o
npm start
```

### Verificaciones Post-Deploy

```bash
# 1. Verificar endpoints
curl https://tu-dominio.com/api/sunat/settings/status

# 2. Verificar worker
pm2 logs sunat-worker

# 3. Verificar feature flag
# Acceder a /pos → verificar que selector aparece si ENABLE_SUNAT=true
```

---

## 🐛 TROUBLESHOOTING

### Selector no aparece en POS

**Síntomas:** Checkbox "Emitir comprobante" no visible  
**Causas:**
1. `ENABLE_SUNAT=false` en `.env`
2. SUNAT no configurado en tienda (no hay SunatSettings)
3. `configured=false` en respuesta de `/api/sunat/settings/status`
4. Método de pago = FIADO (selector se oculta)

**Solución:**
```bash
# Verificar feature flag
grep ENABLE_SUNAT .env

# Verificar config
curl http://localhost:3000/api/sunat/settings/status

# Debe retornar: {"enabled": true, "configured": true, ...}
```

### Comprobante no se emite

**Síntomas:** Toast "Error al emitir comprobante" después de venta  
**Causas:**
1. FIADO bloqueado (409)
2. Permisos insuficientes (FACTURA con CASHIER)
3. customerDocNumber/customerName vacíos
4. Venta ya tiene comprobante activo

**Solución:**
```javascript
// Verificar payload en Network tab
{
  "saleId": "...",
  "docType": "BOLETA",  // o FACTURA
  "customerDocType": "DNI",  // obligatorio
  "customerDocNumber": "12345678",  // obligatorio
  "customerName": "Juan Pérez"  // obligatorio
}

// Revisar respuesta del server
// 409 → FIADO o duplicado
// 403 → Rol insuficiente
// 400 → Campos faltantes
```

### Columna SUNAT no aparece en /sales

**Síntomas:** Solo columnas normales, sin SUNAT  
**Causas:**
1. `ENABLE_SUNAT=false`
2. `sunatEnabled` state = false (no cargó correctamente)

**Solución:**
```javascript
// En consola del browser
console.log(sunatEnabled);  // debe ser true

// Si es false, verificar:
fetch('/api/sunat/settings/status')
  .then(r => r.json())
  .then(d => console.log(d));

// Debe retornar enabled=true, configured=true
```

### Descargas no funcionan

**Síntomas:** Click en "XML" o "CDR" no descarga  
**Causas:**
1. Archivo no existe (XML antes de SIGNED, CDR antes de ACCEPTED)
2. Error 404 al obtener documento

**Solución:**
```bash
# Verificar que documento tiene archivos
curl http://localhost:3000/api/sunat/by-sale/:saleId

# Debe retornar hasXml=true, hasCdr=true (si ACCEPTED)
```

---

## 📚 DOCUMENTOS RELACIONADOS

- [MODULO_18_1_SUNAT_CONFIG_COMPLETADO.md](MODULO_18_1_SUNAT_CONFIG_COMPLETADO.md) — Configuración inicial
- [MODULO_18_2_MODELS_COMPLETADO.md](MODULO_18_2_MODELS_COMPLETADO.md) — Modelos de datos
- [MODULO_18_3_FIRMA_DIGITAL_COMPLETADO.md](MODULO_18_3_FIRMA_DIGITAL_COMPLETADO.md) — Firma digital (futura)
- [MODULO_18_4_WORKER_COMPLETADO.md](MODULO_18_4_WORKER_COMPLETADO.md) — Worker y envío SUNAT
- [AUTHENTICATION.md](AUTHENTICATION.md) — Sistema de roles y permisos

---

## ✅ CONCLUSIÓN

El **MÓDULO 18.5 está COMPLETADO**. Los usuarios pueden:

1. ✅ **Emitir comprobantes desde POS** durante checkout (opcional)
2. ✅ **Ver estado de comprobantes** en historial de ventas
3. ✅ **Emitir comprobantes retroactivos** desde historial
4. ✅ **Reintentar envíos fallidos** con un click
5. ✅ **Descargar XML y CDR** de SUNAT

**Sistema 100% asíncrono:** El checkout NUNCA espera a SUNAT. Si hay error, la venta ya está guardada.

**Próximos pasos sugeridos:**
- MÓDULO 18.6: Firma digital real con certificado (reemplazar mock XML)
- MÓDULO 18.7: Resúmenes diarios (Comunicaciones de Baja)
- MÓDULO 18.8: Notas de Crédito/Débito
- MÓDULO 18.9: PDF representación impresa
- MÓDULO 18.10: Dashboard de facturación

---

**Desarrollado con:** Next.js 15.1.0, TypeScript, Prisma, React 18  
**Última actualización:** 2024-01-XX
