# ✅ MÓDULO 18.2 — PAYLOAD FISCAL DESDE SALE (COMPLETADO)

## Archivos Creados/Modificados

### Nuevos Archivos:
1. **`src/lib/sunat/types.ts`**
   - Tipos TypeScript: `SunatIssuer`, `SunatCustomer`, `SunatLineItem`, `SunatTotals`, `SunatDocumentPayload`
   - `SunatError` con códigos específicos
   - Enums y constantes de error

2. **`src/lib/sunat/buildPayloadFromSale.ts`**
   - Función principal: `buildPayloadFromSale(prisma, { saleId, docType, customer? })`
   - Validaciones completas: feature flag, settings, store archived, customer RUC
   - NO recalcula totales, usa snapshot de Sale/SaleItem
   - Maneja FACTURA (requiere RUC) y BOLETA (permite DNI/otros)

3. **`src/lib/sunat/buildPayloadFromDocument.ts`**
   - Función: `buildPayloadFromDocument(prisma, documentId)`
   - Construye payload desde ElectronicDocument existente
   - Usado por endpoint GET /api/sunat/documents/:id/payload

4. **`src/app/api/sunat/documents/[id]/payload/route.ts`**
   - Endpoint: GET /api/sunat/documents/:id/payload
   - Autorización: SUPERADMIN o OWNER de la tienda
   - Devuelve payload completo de un documento

5. **Scripts de utilidad:**
   - `scripts/configure-sunat-complete.js` - Configurar SUNAT con datos completos
   - `scripts/list-sales-for-sunat.js` - Listar ventas disponibles

### Archivos Modificados:
1. **`src/domain/sunat/audit.ts`**
   - Agregado: `auditSunatPayloadBuilt()` para eventos SUNAT_PAYLOAD_BUILT / SUNAT_PAYLOAD_FAILED
   - Registra: saleId, docType, fullNumber, itemCount, total, errorCode

## Confirmación de NO Modificaciones

✅ **Checkout NO tocado** (`src/app/api/checkout/*`, `src/lib/checkout/*`)
✅ **POS NO tocado** (componentes de punto de venta)
✅ **Promociones NO tocadas** (cálculo de descuentos/cupones)
✅ **Turnos NO tocados** (`src/app/api/shifts/*`)
✅ **Fiado NO tocado** (`src/app/api/receivables/*`)
✅ **Cálculo de totales NO modificado** (se usa snapshot de Sale)

## Checklist de Validaciones

### ✅ 1. Feature Flag OFF
- **Validación**: `ENABLE_SUNAT` deshabilitado → 403 FEATURE_DISABLED
- **Ubicación**: `buildPayloadFromSale.ts` línea 55-62
- **Código error**: `FEATURE_DISABLED`

### ✅ 2. Store Archived
- **Validación**: Store con status=ARCHIVED → 403 STORE_ARCHIVED
- **Ubicación**: `buildPayloadFromSale.ts` línea 47-53
- **Código error**: `STORE_ARCHIVED`

### ✅ 3. Sin SunatSettings
- **Validación**: No existe registro en sunat_settings → 409 SUNAT_SETTINGS_REQUIRED
- **Ubicación**: `buildPayloadFromSale.ts` línea 70-76
- **Código error**: `SUNAT_SETTINGS_REQUIRED`

### ✅ 4. Settings Incompletos
- **Validación**: Falta RUC o razón social → 409 SUNAT_SETTINGS_INCOMPLETE
- **Ubicación**: `buildPayloadFromSale.ts` línea 78-99
- **Código error**: `SUNAT_SETTINGS_INCOMPLETE`
- **Casos:**
  - Falta RUC o razonSocial
  - Ambiente PROD sin credenciales SOL (solUser/solPass)

### ✅ 5. SUNAT No Habilitado
- **Validación**: `enabled=false` en settings → 409 SUNAT_NOT_ENABLED
- **Ubicación**: `buildPayloadFromSale.ts` línea 78-84
- **Código error**: `SUNAT_NOT_ENABLED`

### ✅ 6. FACTURA sin RUC
- **Validación**: docType=FACTURA con customer sin RUC → 400 INVALID_CUSTOMER_RUC
- **Ubicación**: `buildPayloadFromSale.ts` línea 143-161
- **Código error**: `INVALID_CUSTOMER_RUC`
- **Casos:**
  - Customer.docType !== 'RUC'
  - RUC no tiene 11 dígitos
  - Falta razón social

### ✅ 7. BOLETA con DNI inválido
- **Validación**: DNI debe tener 8 dígitos → 400 INVALID_CUSTOMER_DATA
- **Ubicación**: `buildPayloadFromSale.ts` línea 163-172
- **Código error**: `INVALID_CUSTOMER_DATA`

### ✅ 8. Sale no encontrado
- **Validación**: saleId no existe → 404 SALE_NOT_FOUND
- **Ubicación**: `buildPayloadFromSale.ts` línea 36-42
- **Código error**: `SALE_NOT_FOUND`

### ✅ 9. Sale sin items
- **Validación**: Venta sin ítems → 400 SALE_NOT_FOUND
- **Ubicación**: `buildPayloadFromSale.ts` línea 196-201
- **Código error**: `SALE_NOT_FOUND`

## Flujo de Construcción de Payload

```
1. buildPayloadFromSale({ saleId, docType, customer? })
   ↓
2. Leer Sale con items (snapshot)
   ↓
3. Validar Store no ARCHIVED
   ↓
4. Validar ENABLE_SUNAT feature flag
   ↓
5. Leer SunatSettings
   ↓
6. Validar settings completos (RUC, razón social, env, credenciales)
   ↓
7. Construir issuer desde SunatSettings
   ↓
8. Construir customer (de input o de Sale o anónimo)
   ↓
9. Validar customer según docType (FACTURA=RUC, BOLETA=DNI/otros)
   ↓
10. Construir items desde SaleItem snapshot
    - description = productName + productContent
    - quantity, unitPrice, lineSubtotal (NO recalcula)
    - discountsApplied (opcional)
   ↓
11. Construir totals desde Sale (NO recalcula)
    - subtotal = sale.subtotal
    - tax = sale.tax
    - total = sale.total
   ↓
12. Retornar SunatDocumentPayload
```

## Endpoints Disponibles

### GET /api/sunat/documents/:id/payload
- **Autorización**: SUPERADMIN o OWNER
- **Respuesta**: Payload fiscal completo del documento
- **Uso**: Ver payload de un documento ya creado
- **Auditoría**: Registra SUNAT_PAYLOAD_BUILT

## Ejemplo de Payload Generado

```json
{
  "payload": {
    "docType": "BOLETA",
    "series": "B001",
    "number": 3,
    "fullNumber": "B001-00000003",
    "issueDate": "2026-02-02T22:50:06.000Z",
    "issuer": {
      "ruc": "20123456789",
      "razonSocial": "BODEGA EL MERCADO SAC",
      "address": "Av. Los Olivos 123, Lima, Perú",
      "ubigeo": "150101",
      "env": "BETA"
    },
    "customer": {
      "docType": "DNI",
      "docNumber": "12345678",
      "name": "Juan Pérez García",
      "address": null
    },
    "items": [
      {
        "lineNumber": 1,
        "description": "Inca Kola 500ml 500 ml",
        "quantity": 2,
        "unitPrice": 50.00,
        "lineSubtotal": 100.00,
        "discountsApplied": 0
      }
    ],
    "totals": {
      "subtotal": 84.75,
      "tax": 15.25,
      "total": 100.00,
      "currency": "PEN"
    },
    "saleId": "cml62abc...",
    "documentId": "cml62xyz..."
  }
}
```

## Configuración SUNAT Actual

```javascript
{
  enabled: true,
  ruc: '20123456789',
  razonSocial: 'BODEGA EL MERCADO SAC',
  address: 'Av. Los Olivos 123, Lima, Perú',
  ubigeo: '150101',
  env: 'BETA',
  solUser: 'MODDATOS',
  solPass: 'MODDATOS', // Solo para BETA
  defaultFacturaSeries: 'F001',
  defaultBoletaSeries: 'B001',
  defaultNcSeries: 'FC01',
  defaultNdSeries: 'FD01',
  nextFacturaNumber: 3,
  nextBoletaNumber: 3,
  nextNcNumber: 1,
  nextNdNumber: 1
}
```

## Auditoría

Eventos registrados en `audit_logs`:
- **SUNAT_PAYLOAD_BUILT** (severity: INFO)
  - Meta: saleId, docType, fullNumber, itemCount, total
- **SUNAT_PAYLOAD_FAILED** (severity: ERROR)
  - Meta: saleId, docType, fullNumber, errorCode

## Próximos Módulos

- **18.3**: Generación de XML UBL 2.1
- **18.4**: Firma digital con certificado .pfx
- **18.5**: Envío a SUNAT (SOAP Web Services)
- **18.6**: Consulta de CDR y actualización de estado
- **18.7**: Integración automática con checkout

## Estado Final

✅ MÓDULO 18.2 COMPLETADO
- Payload fiscal desde Sale implementado
- Validaciones completas
- Endpoints funcionales
- Auditoría configurada
- Checkout NO modificado
- Sistema listo para recibir XML generator (Módulo 18.3)
