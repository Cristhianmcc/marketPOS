# ✅ MÓDULO 16.1 - HARDENING DE PRODUCCIÓN - CHECKLIST

## 📋 RESUMEN DEL MÓDULO

Sistema de protección contra errores humanos, doble envío y abuso involuntario en ambiente de producción real.

## 🎯 OBJETIVO

Blindar el sistema contra:
- Errores humanos (doble click, spam accidental)
- Red lenta y timeouts
- Abuso involuntario de endpoints críticos
- Checkouts simultáneos del mismo cajero
- Escenarios reales de caja bajo estrés

## 🔒 COMPONENTES IMPLEMENTADOS

### A) Rate Limiting ✅
**Archivo:** `src/lib/rateLimit.ts`
- ✅ Cache en memoria con limpieza automática
- ✅ Límites configurados por endpoint:
  - checkout: 5 requests / 10 segundos
  - cancel: 3 requests / 30 segundos
  - shift-open: 2 requests / minuto
  - shift-close: 2 requests / minuto
  - receivable-pay: 5 requests / 10 segundos
  - restore: 1 request / minuto
  - admin: 10 requests / minuto
- ✅ Respuesta HTTP 429 con mensaje claro
- ✅ Auditoría de eventos RATE_LIMIT_EXCEEDED

**Integración:**
- ✅ `/api/sales/checkout/route.ts`
- ✅ `/api/shifts/open/route.ts`
- ✅ `/api/shifts/[id]/close/route.ts`
- ✅ `/api/receivables/[id]/pay/route.ts`

### B) Idempotency (Doble Submit Prevention) ✅
**Archivo:** `src/lib/idempotency.ts`
- ✅ Cache en memoria con TTL de 60 segundos
- ✅ Limpieza automática de entradas expiradas
- ✅ Guarda resultado de operaciones exitosas
- ✅ Devuelve mismo resultado si key repetida
- ✅ Respuesta HTTP 200 con code: IDEMPOTENT_REPLAY

**Integración:**
- ✅ `/api/sales/checkout/route.ts` - Header Idempotency-Key
- ✅ Frontend POS genera UUID único por intento

### C) Checkout Lock ✅
**Archivo:** `src/lib/checkoutLock.ts`
- ✅ Previene checkouts simultáneos por cajero
- ✅ Lock con TTL de 15 segundos
- ✅ Liberación automática al expirar
- ✅ Liberación manual al finalizar/error
- ✅ Respuesta HTTP 409 con code: CHECKOUT_IN_PROGRESS
- ✅ Auditoría de eventos CHECKOUT_LOCKED

**Integración:**
- ✅ `/api/sales/checkout/route.ts` - Adquiere y libera lock
- ✅ Finally block para garantizar liberación

### D) Validaciones Defensivas Extra ✅
**En checkout endpoint:**
- ✅ Validar Store ACTIVE antes de procesar
- ✅ Validar User ACTIVE antes de procesar
- ✅ Validar shift abierto (excepto FIADO)
- ✅ Validar items.length > 0
- ✅ Validar total > 0
- ✅ Límites operativos (ya aplicados en Módulo 15)

### E) Timeout Protection ✅
**En checkout endpoint:**
- ✅ Medir tiempo desde inicio de request
- ✅ Si > 3 segundos → cancelar con error 500
- ✅ Código: CHECKOUT_TIMEOUT
- ✅ Auditoría de evento CHECKOUT_TIMEOUT

### F) Frontend UX Defensivo ✅
**Archivo:** `src/app/pos/page.tsx`
- ✅ Botón "Finalizar venta" se deshabilita al click
- ✅ Spinner visible durante procesamiento (processing state)
- ✅ No permite múltiples clicks
- ✅ Toasts claros para rate limit, lock, replay
- ✅ Generación de Idempotency-Key único
- ✅ Manejo de códigos HTTP 429 y 409

### G) Auditoría Completa ✅
**Nuevos eventos registrados:**
- ✅ RATE_LIMIT_EXCEEDED (severity: WARN)
- ✅ CHECKOUT_REPLAY (severity: INFO)
- ✅ CHECKOUT_LOCKED (severity: WARN)
- ✅ CHECKOUT_TIMEOUT (severity: ERROR)
- ✅ DUPLICATE_SUBMIT_PREVENTED (implícito en CHECKOUT_REPLAY)

**Metadata incluida:**
- ✅ storeId, userId
- ✅ IP, userAgent
- ✅ endpoint, resetAt
- ✅ idempotencyKey (cuando aplica)

## 📝 CHECKLIST MANUAL DE PRUEBAS

### 1. Doble Click en "Finalizar Venta"
**Objetivo:** Verificar que solo se crea 1 venta

**Pasos:**
1. [ ] Agregar productos al carrito
2. [ ] Click en "Finalizar Venta"
3. [ ] Click en "Confirmar Pago"
4. [ ] **Hacer doble click rápido** en el botón
5. [ ] Verificar que solo se crea 1 venta en base de datos
6. [ ] Verificar que el botón se deshabilita inmediatamente
7. [ ] Verificar que aparece spinner

**Resultado esperado:**
- Solo 1 venta creada
- Botón deshabilitado después del primer click
- Toast de confirmación único

---

### 2. Repetir Idempotency Key
**Objetivo:** Verificar que devuelve resultado anterior

**Pasos:**
1. [ ] Hacer una venta normal y capturar el idempotencyKey
2. [ ] Usar Postman/curl para repetir el request con MISMO idempotencyKey
3. [ ] Verificar respuesta HTTP 200
4. [ ] Verificar code: "IDEMPOTENT_REPLAY"
5. [ ] Verificar que devuelve mismos datos (saleId, saleNumber)
6. [ ] Verificar en DB que NO se duplicó la venta
7. [ ] Verificar log de auditoría CHECKOUT_REPLAY

**Resultado esperado:**
- HTTP 200 con code: IDEMPOTENT_REPLAY
- Mismos datos de venta
- 1 sola venta en DB
- Log de auditoría CHECKOUT_REPLAY

---

### 3. Simular Red Lenta
**Objetivo:** Verificar que no duplica venta con latencia

**Pasos:**
1. [ ] Usar Chrome DevTools Network → Throttling → Slow 3G
2. [ ] Agregar productos al carrito
3. [ ] Hacer checkout
4. [ ] **NO hacer click múltiples veces** (solo esperar)
5. [ ] Verificar que se crea solo 1 venta
6. [ ] Verificar que se muestra spinner mientras espera

**Resultado esperado:**
- 1 venta creada
- Spinner visible durante espera
- Sin errores en consola

---

### 4. Dos Tabs Mismo Cajero
**Objetivo:** Verificar que segundo checkout se bloquea

**Pasos:**
1. [ ] Abrir 2 tabs del POS con mismo usuario
2. [ ] En Tab 1: Agregar productos y hacer checkout
3. [ ] **Antes de que termine Tab 1**, en Tab 2: Hacer otro checkout
4. [ ] Verificar que Tab 2 recibe error 409
5. [ ] Verificar mensaje: "Ya tienes una venta en proceso"
6. [ ] Verificar log de auditoría CHECKOUT_LOCKED
7. [ ] Esperar 15 segundos y verificar que Tab 2 ahora puede hacer checkout

**Resultado esperado:**
- Tab 2 bloqueada mientras Tab 1 procesa
- HTTP 409 con code: CHECKOUT_IN_PROGRESS
- Toast claro en Tab 2
- Log de auditoría CHECKOUT_LOCKED
- Después de 15s, Tab 2 puede procesar

---

### 5. Forzar Rate Limit en Checkout
**Objetivo:** Verificar límite de 5 requests / 10 segundos

**Pasos:**
1. [ ] Usar script o Postman Runner
2. [ ] Enviar 6 requests de checkout en <10 segundos
3. [ ] Verificar que el 6to recibe HTTP 429
4. [ ] Verificar mensaje: "Demasiadas solicitudes"
5. [ ] Verificar log de auditoría RATE_LIMIT_EXCEEDED
6. [ ] Esperar 10 segundos
7. [ ] Verificar que ahora permite nuevo checkout

**Resultado esperado:**
- Primeros 5 requests: OK (o error normal)
- 6to request: HTTP 429
- Mensaje claro de rate limit
- Log de auditoría con severity WARN
- Después de 10s: vuelve a permitir

---

### 6. Verificar AuditLog Completo
**Objetivo:** Verificar que se registran todos los eventos de hardening

**Pasos:**
1. [ ] Abrir `/admin/audit` o consultar DB directamente
2. [ ] Hacer pruebas 1-5
3. [ ] Verificar que aparecen logs de:
   - RATE_LIMIT_EXCEEDED
   - CHECKOUT_REPLAY
   - CHECKOUT_LOCKED
   - (CHECKOUT_TIMEOUT si se simula)
4. [ ] Verificar metadata completa (storeId, userId, IP, endpoint)

**Resultado esperado:**
- Todos los eventos registrados
- Metadata completa y correcta
- Timestamps correctos

---

### 7. Validaciones Defensivas
**Objetivo:** Verificar que se validan store y user activos

**Pasos:**
1. [ ] En DB, poner `status = 'ARCHIVED'` en Store
2. [ ] Intentar hacer checkout
3. [ ] Verificar error: "La tienda no está activa"
4. [ ] Restaurar Store
5. [ ] En DB, poner `active = false` en User
6. [ ] Intentar hacer checkout
7. [ ] Verificar error: "El usuario no está activo"

**Resultado esperado:**
- Ambos casos devuelven HTTP 403
- Mensajes claros
- No se permite checkout

---

### 8. Timeout Simulation (Avanzado)
**Objetivo:** Verificar que se cancela si tarda >3 segundos

**Pasos:**
1. [ ] Modificar temporalmente código para agregar `await new Promise(r => setTimeout(r, 3500))`
2. [ ] Hacer checkout
3. [ ] Verificar error: "La operación tardó demasiado"
4. [ ] Verificar log de auditoría CHECKOUT_TIMEOUT
5. [ ] Remover delay y verificar que funciona normal

**Resultado esperado:**
- HTTP 500 con code: CHECKOUT_TIMEOUT
- Log de auditoría con severity ERROR
- Sin código agregado: funciona normal

---

### 9. Verificar que NO se rompió checkout normal
**Objetivo:** Garantizar que checkout existente sigue funcionando

**Pasos:**
1. [ ] Venta CASH normal → OK
2. [ ] Venta YAPE → OK
3. [ ] Venta PLIN → OK
4. [ ] Venta CARD → OK
5. [ ] Venta FIADO → OK
6. [ ] Con promociones 2x1 → OK
7. [ ] Con promociones categoría → OK
8. [ ] Con promociones volumen → OK
9. [ ] Con promociones n-ésimo → OK
10. [ ] Con cupón → OK
11. [ ] Con descuento manual → OK
12. [ ] Con límites operativos → OK

**Resultado esperado:**
- TODOS los casos funcionan como antes
- CERO regresiones

---

### 10. Verificar que NO se rompió retry de saleNumber
**Objetivo:** Garantizar que reintentos siguen funcionando

**Pasos:**
1. [ ] Hacer 2 checkouts simultáneos (script o Postman)
2. [ ] Verificar que AMBOS se completan exitosamente
3. [ ] Verificar que tienen saleNumbers consecutivos
4. [ ] Verificar logs: debe haber reintento (P2002) en uno de ellos

**Resultado esperado:**
- Ambas ventas exitosas
- saleNumbers sin gaps
- Reintentos funcionan

---

### 11. Verificar que NO se rompió FIADO
**Objetivo:** Garantizar que FIADO sigue funcionando

**Pasos:**
1. [ ] Crear cliente
2. [ ] Hacer venta FIADO sin turno abierto → OK
3. [ ] Verificar Receivable creada
4. [ ] Verificar logs de auditoría
5. [ ] Pagar cuenta → OK

**Resultado esperado:**
- Venta FIADO sin turno: OK
- Receivable creada correctamente
- Pago funciona

---

## 🚨 CRITERIOS DE ÉXITO - FINAL

- [ ] ✅ Todos los 11 tests manuales pasados
- [ ] ✅ CERO regresiones en módulos existentes
- [ ] ✅ Rate limiting funciona en todos los endpoints
- [ ] ✅ Idempotency previene doble venta
- [ ] ✅ Lock previene checkouts simultáneos
- [ ] ✅ Frontend UX defensivo (botón deshabilitado, spinner)
- [ ] ✅ Auditoría completa de todos los eventos
- [ ] ✅ Validaciones defensivas activas
- [ ] ✅ Timeout protection funciona
- [ ] ✅ No hay errores de compilación
- [ ] ✅ No hay warnings críticos

---

## 📊 MÉTRICAS DE ÉXITO

**Rate Limiting:**
- [ ] 100% de requests excedentes devuelven 429
- [ ] 100% de rate limits registrados en audit log

**Idempotency:**
- [ ] 100% de replays devuelven resultado anterior
- [ ] 0% de duplicados en DB por replay

**Checkout Lock:**
- [ ] 100% de checkouts simultáneos bloqueados
- [ ] Lock se libera en 100% de casos (éxito/error)

**Frontend:**
- [ ] 0% de doble submit exitosos
- [ ] 100% de botones deshabilitados durante procesamiento

**Auditoría:**
- [ ] 100% de eventos hardening registrados
- [ ] 100% de logs con metadata completa

---

## 🔍 DEBUGGING

**Si falla rate limiting:**
- Verificar que `checkRateLimit()` se llama ANTES de lógica
- Verificar headers de respuesta (debería tener resetAt)
- Verificar logs de auditoría

**Si falla idempotency:**
- Verificar que frontend envía header `Idempotency-Key`
- Verificar que se genera UUID único
- Verificar TTL (60 segundos)

**Si falla lock:**
- Verificar que lock se libera en finally block
- Verificar TTL (15 segundos)
- Verificar que se usa storeId + userId como key

**Si frontend permite doble click:**
- Verificar que `processing` state se setea a true INMEDIATAMENTE
- Verificar que botón tiene `disabled={processing}`
- Verificar que clearCart() resetea processing a false

---

## ✅ MÓDULO COMPLETADO

Una vez todos los tests pasen, el módulo 16.1 está listo para producción.

**Fecha de implementación:** 29/12/2025
**Status:** ✅ IMPLEMENTADO
