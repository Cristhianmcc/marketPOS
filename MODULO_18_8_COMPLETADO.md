# ✅ MÓDULO 18.8 — SUNAT ONBOARDING POR TIENDA

## Resumen

Implementación completa del wizard de onboarding para configurar facturación electrónica SUNAT por tienda, incluyendo:
- Setup wizard guiado de 7 pasos
- Tests de firma y envío BETA
- Preferencias de auto-emisión
- Activación controlada (BETA/PROD)

---

## Archivos Creados/Modificados

### Backend - Endpoints de Onboarding

| Archivo | Descripción |
|---------|-------------|
| `src/app/api/onboarding/sunat/status/route.ts` | GET estado completo del onboarding |
| `src/app/api/onboarding/sunat/fiscal/route.ts` | PATCH datos fiscales (RUC, razón social) |
| `src/app/api/onboarding/sunat/credentials/route.ts` | PATCH credenciales SOL |
| `src/app/api/onboarding/sunat/certificate/route.ts` | PATCH certificado digital PFX |
| `src/app/api/onboarding/sunat/test-sign/route.ts` | POST test de firma local |
| `src/app/api/onboarding/sunat/test-beta/route.ts` | POST test envío SUNAT BETA |
| `src/app/api/onboarding/sunat/preferences/route.ts` | PATCH preferencias de emisión |
| `src/app/api/onboarding/sunat/activate/route.ts` | PATCH activar/desactivar SUNAT |
| `src/app/api/sunat/preferences/route.ts` | GET preferencias para POS |

### Frontend - UI Wizard

| Archivo | Descripción |
|---------|-------------|
| `src/app/onboarding/sunat/page.tsx` | Wizard completo de 7 pasos |

### Schema

| Archivo | Cambios |
|---------|---------|
| `prisma/schema.prisma` | Nuevos campos en SunatSettings: stepFiscalData, stepSolCredentials, stepCertificate, stepTestSign, stepTestBeta, autoEmitBoleta, allowFactura, defaultDocType |

### Modificados

| Archivo | Cambios |
|---------|---------|
| `src/components/pos/SunatComprobanteSelector.tsx` | Integración con preferencias de auto-emisión |
| `src/app/settings/page.tsx` | Enlace a wizard SUNAT |
| `.env` | Variable NEXT_PUBLIC_ENABLE_SUNAT |

---

## Flujo del Wizard

```
┌─────────────────────────────────────────────────────────────┐
│  PASO 1: DATOS FISCALES                                     │
│  - RUC (11 dígitos)                                         │
│  - Razón Social                                             │
│  - Dirección Fiscal                                         │
│  - Ubigeo (opcional)                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 2: CREDENCIALES SOL                                   │
│  - Usuario SOL                                              │
│  - Clave SOL (nunca se muestra después)                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 3: CERTIFICADO DIGITAL                                │
│  - Upload archivo .pfx                                      │
│  - Contraseña del certificado                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 4: TEST DE FIRMA                                      │
│  - Verifica que el certificado puede firmar XML             │
│  - Resultado: OK / Error                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 5: TEST SUNAT BETA                                    │
│  - Envía comprobante de prueba a SUNAT BETA                 │
│  - Verifica conectividad                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 6: PREFERENCIAS                                       │
│  - Auto-emitir BOLETA: ON/OFF                               │
│  - Permitir FACTURA: ON/OFF                                 │
│  - Tipo por defecto: NONE/BOLETA/FACTURA                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 7: ACTIVAR                                            │
│  - Toggle enabled                                           │
│  - Ambiente: BETA / PROD                                    │
│  - PROD requiere confirmación typed                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Preferencias de Emisión

| Preferencia | Descripción |
|-------------|-------------|
| `autoEmitBoleta` | Si es true, al confirmar venta se pre-selecciona emitir BOLETA |
| `allowFactura` | Permite emitir FACTURA (requiere RUC del cliente) |
| `defaultDocType` | NONE, BOLETA, o FACTURA por defecto |

---

## Seguridad

- ✅ Solo OWNER puede acceder al wizard
- ✅ Passwords nunca se devuelven en API después de guardar
- ✅ Certificado no se loguea
- ✅ Audit logs para cada acción (sin secretos)
- ✅ PROD requiere confirmación typed "ACTIVAR PRODUCCION"
- ✅ Tienda ARCHIVED no puede configurar

---

## Audit Logs Generados

- `SUNAT_ONBOARD_FISCAL_UPDATED`
- `SUNAT_ONBOARD_CREDENTIALS_UPDATED`
- `SUNAT_ONBOARD_CERT_UPDATED`
- `SUNAT_ONBOARD_TEST_SIGN_SUCCESS`
- `SUNAT_ONBOARD_TEST_SIGN_FAILED`
- `SUNAT_ONBOARD_TEST_BETA_SUCCESS`
- `SUNAT_ONBOARD_TEST_BETA_FAILED`
- `SUNAT_ONBOARD_PREFERENCES_UPDATED`
- `SUNAT_ONBOARD_ACTIVATED`
- `SUNAT_ONBOARD_DEACTIVATED`
- `SUNAT_ENV_SWITCHED_TO_PROD`

---

## Confirmación de NO Cambios

Los siguientes archivos **NO fueron modificados**:

- ❌ `src/app/api/pos/sale/route.ts` (checkout)
- ❌ Archivos de promociones
- ❌ Archivos de turnos/caja
- ❌ Archivos de fiado
- ❌ Archivos de backups

---

## Checklist de Pruebas

### Setup

- [ ] ENABLE_SUNAT=false → Wizard muestra "No disponible en tu plan"
- [ ] Store ARCHIVED → Wizard muestra "Tienda archivada"
- [ ] OWNER puede acceder al wizard
- [ ] CASHIER NO puede acceder al wizard

### Paso 1: Datos Fiscales

- [ ] RUC validado (11 dígitos, prefijo válido)
- [ ] Razón social mínimo 3 caracteres
- [ ] Dirección mínimo 5 caracteres
- [ ] Guarda correctamente

### Paso 2: Credenciales SOL

- [ ] Usuario SOL requerido
- [ ] Contraseña SOL requerida
- [ ] Contraseña NO se muestra después de guardar
- [ ] Muestra "Configurado ✅" si ya existe

### Paso 3: Certificado

- [ ] Upload de archivo .pfx funciona
- [ ] Contraseña requerida
- [ ] Base64 válido
- [ ] Resetea test de firma si se cambia certificado

### Paso 4: Test Firma

- [ ] Firma XML dummy correctamente
- [ ] Muestra error si certificado inválido
- [ ] Marca step como completado si OK

### Paso 5: Test BETA

- [ ] Solo disponible en env=BETA
- [ ] Envía comprobante de prueba
- [ ] Acepta si SUNAT responde (aunque RUC no autorizado)

### Paso 6: Preferencias

- [ ] Toggle autoEmitBoleta funciona
- [ ] Toggle allowFactura funciona
- [ ] defaultDocType=FACTURA solo si allowFactura=true

### Paso 7: Activar

- [ ] Toggle enabled funciona
- [ ] BETA se activa sin confirmación
- [ ] PROD requiere confirmación "ACTIVAR PRODUCCION"
- [ ] Muestra estado actual

### Integración POS

- [ ] Si autoEmitBoleta=true → checkbox pre-marcado en checkout
- [ ] Si allowFactura=false → botón FACTURA oculto
- [ ] Auto-emisión no bloquea checkout si falla

---

## Cómo Probar

1. Ir a `/settings` y click en "Configurar SUNAT"
2. O ir directamente a `/onboarding/sunat`
3. Completar los 7 pasos
4. Activar en BETA
5. Hacer una venta y verificar que el checkbox está pre-marcado

---

## Estado

✅ **MÓDULO 18.8 COMPLETADO**

Fecha: 2026-02-04
