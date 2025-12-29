# MÓDULO 16.2 — ONBOARDING DE TIENDA
## Checklist de Testing

**Objetivo**: Validar que el sistema de onboarding permite configurar una nueva tienda en menos de 30-60 minutos sin romper funcionalidad existente.

---

## ✅ FASE 1: Schema y Migración

### 1.1 Verificar Migración
- [ ] Ejecutar `npx prisma migrate status` → confirmar migración `20251229233513_add_onboarding_fields` aplicada
- [ ] Verificar que StoreSettings tiene nuevos campos:
  ```sql
  SELECT column_name, data_type, is_nullable 
  FROM information_schema.columns 
  WHERE table_name = 'store_settings' 
  AND column_name IN ('onboarding_completed_at', 'onboarding_step', 'onboarding_dismissed_at', 'default_payment_method', 'ticket_header_line1', 'ticket_header_line2');
  ```
- [ ] Confirmar que tiendas existentes tienen valores por defecto (step=0, defaults aplicados)

---

## ✅ FASE 2: Endpoints Backend

### 2.1 GET /api/settings/onboarding
**Precondición**: Estar autenticado con sesión válida

**Test 1: Tienda nueva (sin onboarding)**
```bash
curl http://localhost:3000/api/settings/onboarding
```
**Esperado**:
```json
{
  "step": 0,
  "completedAt": null,
  "dismissedAt": null,
  "defaultPaymentMethod": "CASH",
  "ticketHeaderLine1": null,
  "ticketHeaderLine2": null
}
```

**Test 2: Auto-creación de StoreSettings**
- [ ] Eliminar StoreSettings de una tienda: `DELETE FROM store_settings WHERE store_id = '...'`
- [ ] Llamar GET /api/settings/onboarding
- [ ] Verificar que se crea automáticamente con step=0

---

### 2.2 PUT /api/settings/onboarding
**Test 3: Actualizar step (OWNER only)**
```bash
curl -X PUT http://localhost:3000/api/settings/onboarding \
  -H "Content-Type: application/json" \
  -d '{"step": 3}'
```
**Esperado**: `{"step": 3, "completed": false, "dismissed": false}`

**Test 4: Marcar como completado**
```bash
curl -X PUT http://localhost:3000/api/settings/onboarding \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```
**Esperado**:
- `onboardingCompletedAt` set a timestamp actual
- Audit log: `ONBOARDING_COMPLETED`

**Test 5: Desestimar onboarding**
```bash
curl -X PUT http://localhost:3000/api/settings/onboarding \
  -H "Content-Type: application/json" \
  -d '{"dismissed": true}'
```
**Esperado**:
- `onboardingDismissedAt` set a timestamp actual
- Banner debe ocultarse

**Test 6: Validar rol (CASHIER no puede actualizar)**
- [ ] Login como CASHIER
- [ ] Intentar PUT /api/settings/onboarding
- [ ] **Esperado**: 403 Forbidden "Solo el dueño puede modificar el onboarding"

---

### 2.3 PUT /api/onboarding/store-info
**Test 7: Actualizar información de tienda**
```bash
curl -X PUT http://localhost:3000/api/onboarding/store-info \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bodega San Martín",
    "ruc": "20123456789",
    "address": "Av. Principal 123",
    "phone": "987654321",
    "ticketHeaderLine1": "BODEGA SAN MARTIN",
    "ticketHeaderLine2": "RUC: 20123456789"
  }'
```
**Esperado**:
- Store.name actualizado
- Store.ruc, address, phone actualizados
- StoreSettings.ticketHeaderLine1/2 actualizados
- Audit log: `STORE_INFO_UPDATED` con `duringOnboarding: true`

**Test 8: Validar nombre mínimo**
```bash
curl -X PUT http://localhost:3000/api/onboarding/store-info \
  -H "Content-Type: application/json" \
  -d '{"name": "AB"}'
```
**Esperado**: 400 Bad Request "El nombre de la tienda debe tener al menos 3 caracteres"

---

### 2.4 POST /api/onboarding/create-user
**Test 9: Crear cajero durante onboarding**
```bash
curl -X POST http://localhost:3000/api/onboarding/create-user \
  -H "Content-Type: application/json" \
  -d '{
    "name": "María González",
    "email": "maria@bodega.com",
    "password": "test1234",
    "role": "CASHIER"
  }'
```
**Esperado**:
- User creado con role=CASHIER (forzado)
- Password hasheado con bcrypt
- Audit log: `CASHIER_CREATED_DURING_ONBOARDING`
- Response: `{id, name, email, role, createdAt}` (sin password)

**Test 10: Validar email único**
- [ ] Crear user con email existente
- [ ] **Esperado**: 400 "Ya existe un usuario con ese email"

**Test 11: Validar formato email**
```bash
curl -X POST http://localhost:3000/api/onboarding/create-user \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "email": "invalid-email", "password": "test123"}'
```
**Esperado**: 400 "Email inválido"

**Test 12: Validar longitud password**
```bash
curl -X POST http://localhost:3000/api/onboarding/create-user \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "email": "test@test.com", "password": "12345"}'
```
**Esperado**: 400 "La contraseña debe tener al menos 6 caracteres"

---

### 2.5 GET /api/onboarding/csv-template
**Test 13: Descargar plantilla CSV**
```bash
curl -O http://localhost:3000/api/onboarding/csv-template
file plantilla_productos.csv
```
**Esperado**:
- Archivo descargado con UTF-8 BOM (`\uFEFF`)
- Headers: `barcode;nombre;marca;contenido;categoria;unitType;price;stock;minStock`
- 10 productos de ejemplo
- Ambos separadores (`;` en headers)

---

### 2.6 POST /api/onboarding/import-csv (Preview)
**Test 14: Upload CSV válido**
```bash
curl -X POST http://localhost:3000/api/onboarding/import-csv \
  -F "file=@plantilla_productos.csv"
```
**Esperado**:
```json
{
  "preview": [
    {
      "barcode": "7754200000011",
      "nombre": "Coca Cola 1.5L",
      "marca": "Coca Cola",
      "unitType": "UNIT",
      "price": 5.5,
      "stock": 50,
      "minStock": 10,
      "errors": []
    },
    ...
  ],
  "summary": {
    "totalRows": 10,
    "previewRows": 10,
    "validRows": 10,
    "errorRows": 0,
    "hasMore": false
  }
}
```

**Test 15: CSV con errores de validación**
- [ ] Crear CSV con:
  - Producto sin nombre
  - Producto con unitType="INVALID"
  - Producto con price negativo
  - Producto con stock no numérico
- [ ] Upload CSV
- [ ] **Esperado**: `errors` array con mensajes específicos por cada producto
- [ ] **Esperado**: `summary.errorRows > 0`

**Test 16: CSV con BOM y comas**
- [ ] Crear CSV con UTF-8 BOM y separador `,`
- [ ] Upload
- [ ] **Esperado**: Parser detecta separador y procesa correctamente

**Test 17: CSV con >500 productos**
- [ ] Crear CSV con 600 rows
- [ ] Upload
- [ ] **Esperado**: 400 "El archivo no puede tener más de 500 productos"

**Test 18: Preview con >20 productos**
- [ ] Upload CSV con 100 productos válidos
- [ ] **Esperado**: 
  - `preview` tiene 20 items
  - `summary.hasMore = true`
  - `summary.totalRows = 100`

---

### 2.7 POST /api/onboarding/import-csv/confirm
**Test 19: Confirmar import válido**
```bash
curl -X POST http://localhost:3000/api/onboarding/import-csv/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "nombre": "Test Product",
        "unitType": "UNIT",
        "price": 5.00,
        "stock": 10,
        "categoria": "Abarrotes"
      }
    ]
  }'
```
**Esperado**:
- StoreProduct creado con auto-generated SKU: `SKU_{timestamp}_{random}`
- `isActive = true` (tiene precio)
- Audit log: `ONBOARDING_IMPORT_COMPLETED`
- Response: `{success: true, imported: 1, skipped: 0, errors: []}`

**Test 20: Auto-generar SKU cuando barcode null**
- [ ] Import producto sin barcode
- [ ] Verificar en DB: `internal_sku` sigue patrón `SKU_\d{13}_\d{4}`

**Test 21: Producto con price=0 → isActive=false**
```bash
curl -X POST http://localhost:3000/api/onboarding/import-csv/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {"nombre": "Sin Precio", "unitType": "UNIT", "price": 0, "stock": 0}
    ]
  }'
```
**Esperado**:
- StoreProduct creado con `is_active = false`
- No aparece en POS (filtro `isActive = true`)

**Test 22: Validar barcode único por tienda**
- [ ] Import producto con barcode "123456"
- [ ] Intentar import segundo producto con mismo barcode
- [ ] **Esperado**: 
  - Primer producto: imported
  - Segundo producto: skipped
  - `errors` contiene: "Código de barras 123456 ya existe"

**Test 23: Import con >500 productos**
```bash
curl -X POST http://localhost:3000/api/onboarding/import-csv/confirm \
  -H "Content-Type: application/json" \
  -d '{"products": [... 600 items ...]}'
```
**Esperado**: 400 "No se pueden importar más de 500 productos a la vez"

**Test 24: Validar transacción (rollback en error)**
- [ ] Import 5 productos, el 3ro con error crítico (ej: barcode duplicado en mismo batch)
- [ ] **Esperado**: Todos los productos rolleados (ninguno insertado)

**Test 25: Audit log en fallo**
- [ ] Provocar error en import (ej: DB down)
- [ ] **Esperado**: Audit log `ONBOARDING_IMPORT_FAILED` con error message

---

## ✅ FASE 3: UI del Wizard

### 3.1 Stepper Component
**Test 26: Renderizado de pasos**
- [ ] Navegar a `/onboarding`
- [ ] Verificar Stepper muestra 6 pasos:
  1. Datos de tienda
  2. Configuración
  3. Productos
  4. Usuarios
  5. Ticket
  6. Listo
- [ ] **Esperado**: Paso 1 activo (anillo azul), resto inactivos (gris)

**Test 27: Visual states**
- [ ] Avanzar a paso 3
- [ ] **Esperado**:
  - Pasos 1-2: verde con ✓
  - Paso 3: azul con anillo
  - Pasos 4-6: gris

---

### 3.2 Step 1: Datos de Tienda
**Test 28: Auto-fill ticket headers**
- [ ] Ingresar nombre "Bodega Mi Casa"
- [ ] **Esperado**: ticketHeader1 auto-completa con "Bodega Mi Casa"

**Test 29: Validación nombre requerido**
- [ ] Dejar nombre vacío
- [ ] Click "Siguiente"
- [ ] **Esperado**: Error "El nombre de la tienda debe tener al menos 3 caracteres"

**Test 30: Guardar información**
- [ ] Llenar todos los campos (nombre, RUC, dirección, teléfono, headers)
- [ ] Click "Siguiente"
- [ ] **Esperado**:
  - Llamada PUT /api/onboarding/store-info exitosa
  - Avanza a paso 2
  - onboardingStep actualizado a 2

---

### 3.3 Step 2: Configuración
**Test 31: Toggle "Usar turnos"**
- [ ] Desactivar checkbox "Usar turnos de caja"
- [ ] **Esperado**: Campo "Efectivo inicial" desaparece

**Test 32: Selector de método de pago**
- [ ] Cambiar de "Efectivo" a "Yape"
- [ ] Click "Siguiente"
- [ ] **Esperado**: defaultPaymentMethod guardado como "YAPE"

---

### 3.4 Step 3: Productos
**Test 33: Botones de import method**
- [ ] Verificar 2 botones: "Importar CSV" y "Agregar Manual"
- [ ] Click "Agregar Manual"
- [ ] **Esperado**: Mensaje "Esta opción te redirigirá a Inventario..." con botón "Ir a Inventario"

**Test 34: Descargar plantilla**
- [ ] Click "Importar CSV"
- [ ] Click "Descargar plantilla CSV"
- [ ] **Esperado**: Archivo `plantilla_productos.csv` descargado

**Test 35: Upload CSV válido**
- [ ] Seleccionar plantilla descargada
- [ ] **Esperado**:
  - Preview table con 10 productos
  - Summary: "10 productos • ✅ 10 válidos • ❌ 0 con errores"
  - Botón cambia a "Importar y Continuar"

**Test 36: Upload CSV con errores**
- [ ] Modificar plantilla: eliminar nombre de 1 producto
- [ ] Upload
- [ ] **Esperado**:
  - Row con error tiene fondo rojo
  - Columna "Estado" muestra mensaje de error específico
  - Summary: "❌ 1 con errores"

**Test 37: Confirmar import**
- [ ] Upload CSV válido
- [ ] Click "Importar y Continuar"
- [ ] **Esperado**:
  - Loading spinner aparece
  - Alert "✅ 10 productos importados correctamente"
  - Avanza a paso 4

**Test 38: Cambiar archivo**
- [ ] Después de preview, click "Cambiar archivo"
- [ ] **Esperado**: Vuelve a selector de import method

---

### 3.5 Step 4: Usuarios
**Test 39: Skip opcional**
- [ ] Dejar campos vacíos
- [ ] Click "Siguiente"
- [ ] **Esperado**: Avanza a paso 5 sin crear usuario

**Test 40: Crear cajero**
- [ ] Llenar: nombre "María", email "maria@test.com", password "test1234"
- [ ] Click "Siguiente"
- [ ] **Esperado**:
  - POST /api/onboarding/create-user exitoso
  - Avanza a paso 5

**Test 41: Validación email**
- [ ] Ingresar email inválido "not-an-email"
- [ ] Click "Siguiente"
- [ ] **Esperado**: Error "Email inválido"

---

### 3.6 Step 5: Ticket Preview
**Test 42: Preview en vivo**
- [ ] Verificar preview muestra:
  - ticketHeader1 (de paso 1)
  - ticketHeader2
  - 3 productos de ejemplo
  - Total de ejemplo
  - "¡Gracias por su compra!"
  - Fecha/hora actual

**Test 43: Test print**
- [ ] Click "Imprimir ticket de prueba"
- [ ] **Esperado**: Window.print() abre diálogo de impresión

---

### 3.7 Step 6: Completado
**Test 44: Botón final**
- [ ] Verificar pantalla muestra:
  - ✅ "¡Todo listo para empezar! 🎉"
  - Lista de próximos pasos recomendados
  - Botón "Ir al Punto de Venta"

**Test 45: Marcar como completado**
- [ ] Click "Ir al Punto de Venta"
- [ ] **Esperado**:
  - PUT /api/settings/onboarding con completed=true
  - onboardingCompletedAt set
  - Redirect a /pos
  - Banner NO aparece en POS

---

### 3.8 Navegación del Wizard
**Test 46: Botón "Anterior"**
- [ ] En paso 3, click "Anterior"
- [ ] **Esperado**: Vuelve a paso 2 con datos preservados

**Test 47: Botón "Lo haré luego"**
- [ ] En paso 2, click "Lo haré luego"
- [ ] **Esperado**:
  - PUT /api/settings/onboarding con dismissed=true
  - Redirect a /pos
  - Banner OCULTO (dismissed)

**Test 48: Re-ejecutable**
- [ ] Completar hasta paso 3
- [ ] Cerrar browser
- [ ] Reabrir `/onboarding`
- [ ] **Esperado**: Continúa en paso 3 (onboardingStep guardado)

---

## ✅ FASE 4: Onboarding Banner

### 4.1 Mostrar Banner
**Test 49: Tienda sin onboarding**
- [ ] Crear tienda nueva (onboardingCompletedAt = null)
- [ ] Login como OWNER
- [ ] Navegar a `/pos`
- [ ] **Esperado**: Banner amarillo en top con:
  - "⚠️ Configuración inicial pendiente"
  - "Completa la configuración... (menos de 30 minutos)"
  - Botón "Continuar configuración"
  - Botón X (cerrar)

**Test 50: Banner en Inventario**
- [ ] Navegar a `/inventory`
- [ ] **Esperado**: Mismo banner aparece

**Test 51: Tienda con onboarding completado**
- [ ] Completar onboarding (onboardingCompletedAt set)
- [ ] Navegar a `/pos`
- [ ] **Esperado**: Banner NO aparece

**Test 52: Tienda con onboarding dismissed**
- [ ] En paso 1, click "Lo haré luego" (onboardingDismissedAt set)
- [ ] Navegar a `/pos`
- [ ] **Esperado**: Banner NO aparece

---

### 4.2 Acciones del Banner
**Test 53: Click "Continuar configuración"**
- [ ] Click botón
- [ ] **Esperado**: Redirect a `/onboarding` en paso actual guardado

**Test 54: Click X (Cerrar)**
- [ ] Click X en banner
- [ ] **Esperado**:
  - PUT /api/settings/onboarding con dismissed=true
  - Banner desaparece (fade out)

**Test 55: Banner no imprimible**
- [ ] Con banner visible, hacer window.print()
- [ ] **Esperado**: Banner NO aparece en preview de impresión (`print:hidden` en Tailwind)

---

## ✅ FASE 5: No-Breaking Tests

### 5.1 POS (Punto de Venta)
**Test 56: Venta normal con onboarding completo**
- [ ] Completar onboarding
- [ ] Abrir turno
- [ ] Agregar productos al carrito
- [ ] Procesar venta
- [ ] **Esperado**: Flujo sin cambios

**Test 57: Venta con onboarding incompleto**
- [ ] NO completar onboarding (banner visible)
- [ ] Intentar usar POS
- [ ] **Esperado**: POS funciona normalmente (banner solo es informativo)

**Test 58: Productos importados visibles**
- [ ] Import 10 productos via onboarding CSV
- [ ] Ir a POS
- [ ] **Esperado**: Todos los productos con price>0 aparecen en búsqueda

**Test 59: Productos sin precio NO visibles**
- [ ] Import producto con price=0
- [ ] Buscar en POS
- [ ] **Esperado**: Producto NO aparece (isActive=false)

---

### 5.2 Inventario
**Test 60: Lista de productos**
- [ ] Ir a `/inventory`
- [ ] **Esperado**: Productos importados vía onboarding aparecen en tabla

**Test 61: Editar producto importado**
- [ ] Click editar en producto importado
- [ ] Cambiar precio
- [ ] **Esperado**: Actualización exitosa

---

### 5.3 Turnos (Shifts)
**Test 62: Abrir turno con cajero creado en onboarding**
- [ ] Login con cajero creado en Step 4
- [ ] Abrir turno
- [ ] **Esperado**: Flujo normal sin errores

**Test 63: defaultPaymentMethod aplicado**
- [ ] Configurar defaultPaymentMethod = "YAPE" en onboarding
- [ ] Abrir venta en POS
- [ ] **Esperado**: Método "Yape" preseleccionado

---

### 5.4 Reportes
**Test 64: Ventas de productos importados**
- [ ] Vender 5 productos importados vía onboarding
- [ ] Ir a `/reports`
- [ ] Ver reporte de ventas por producto
- [ ] **Esperado**: Productos aparecen en reporte

---

### 5.5 Cupones y Promociones
**Test 65: Promociones sobre productos importados**
- [ ] Crear promoción "2x1" para producto importado
- [ ] Aplicar en venta
- [ ] **Esperado**: Descuento aplicado correctamente

---

### 5.6 Auditoría
**Test 66: Audit logs de onboarding**
```sql
SELECT action, metadata FROM audit_logs 
WHERE action LIKE 'ONBOARDING%' 
ORDER BY created_at DESC;
```
**Esperado**: Logs de:
- `ONBOARDING_STEP_UPDATED`
- `ONBOARDING_COMPLETED`
- `ONBOARDING_IMPORT_COMPLETED`
- `STORE_INFO_UPDATED`
- `CASHIER_CREATED_DURING_ONBOARDING`

---

### 5.7 Subscriptions & Feature Flags
**Test 67: Feature flags no afectados**
- [ ] Verificar que onboarding NO modifica feature flags existentes
- [ ] Sync feature flags debe seguir funcionando en `/settings/billing`

**Test 68: Plan change con onboarding completo**
- [ ] Completar onboarding
- [ ] Cambiar de plan DEMO → STARTER
- [ ] **Esperado**: Feature flags sync, onboarding no se resetea

---

## ✅ FASE 6: Edge Cases

### 6.1 Múltiples Stores
**Test 69: Onboarding independiente por tienda**
- [ ] Crear Store A y Store B
- [ ] Completar onboarding en Store A
- [ ] Login en Store B
- [ ] **Esperado**: Store B muestra banner (onboarding no completado)

---

### 6.2 Roles
**Test 70: CASHIER no puede modificar onboarding**
- [ ] Login como CASHIER
- [ ] Intentar PUT /api/settings/onboarding
- [ ] **Esperado**: 403 Forbidden

**Test 71: CASHIER ve banner pero no puede continuar**
- [ ] Login como CASHIER en tienda sin onboarding
- [ ] Ver banner en POS
- [ ] Click "Continuar configuración"
- [ ] **Esperado**: Redirect a `/onboarding`, pero PUT endpoints retornan 403

---

### 6.3 Datos Incompletos
**Test 72: Skip todos los pasos opcionales**
- [ ] Step 1: Solo llenar nombre (mínimo requerido)
- [ ] Step 2: Dejar defaults
- [ ] Step 3: Skip (ir a manual después)
- [ ] Step 4: Skip (sin cajero)
- [ ] Step 5: Continuar sin test print
- [ ] Step 6: Completar
- [ ] **Esperado**: Onboarding marcado como completo, tienda funcional

---

### 6.4 CSV Edge Cases
**Test 73: CSV con encoding Latin-1**
- [ ] Crear CSV con acentos en Latin-1 (no UTF-8)
- [ ] Upload
- [ ] **Esperado**: Parser puede fallar (mostrar error claro), o manejar con iconv

**Test 74: CSV con líneas vacías**
- [ ] Plantilla con 5 líneas vacías intercaladas
- [ ] Upload
- [ ] **Esperado**: Líneas vacías ignoradas, solo productos válidos procesados

**Test 75: CSV con decimal separators (coma vs punto)**
- [ ] Producto con precio "5,50" (coma decimal)
- [ ] Upload
- [ ] **Esperado**: Parser convierte comas a puntos, o muestra error claro

---

## ✅ FASE 7: Performance

### 6.1 Import Grande
**Test 76: Import 500 productos (límite)**
- [ ] Generar CSV con 500 productos válidos
- [ ] Upload
- [ ] Confirmar import
- [ ] **Esperado**: 
  - Tiempo < 10 segundos
  - Todos insertados en transacción
  - UI no se congela

**Test 77: Preview 100 productos**
- [ ] Upload CSV con 100 productos
- [ ] Verificar preview
- [ ] **Esperado**: 
  - Solo 20 rows en preview
  - `hasMore = true`
  - Parse time < 2 segundos

---

## ✅ FASE 8: UX & Accesibilidad

### 8.1 Mobile Responsive
**Test 78: Wizard en mobile (375px width)**
- [ ] Abrir `/onboarding` en DevTools mobile view
- [ ] **Esperado**: 
  - Stepper responsive (steps apilados verticalmente)
  - Forms legibles
  - Botones accesibles

**Test 79: Banner en mobile**
- [ ] Ver banner en `/pos` en mobile
- [ ] **Esperado**: 
  - Texto no truncado
  - Botones alineados verticalmente
  - X visible y clickeable

---

### 8.2 Teclado & Accesibilidad
**Test 80: Navegación con Tab**
- [ ] En Step 1, navegar con Tab
- [ ] **Esperado**: Foco visible en inputs, orden lógico

**Test 81: Enter para submit**
- [ ] Llenar Step 1
- [ ] Presionar Enter en último input
- [ ] **Esperado**: Avanza a Step 2 (como click "Siguiente")

---

## ✅ FASE 9: Regression Tests

### 9.1 Tiendas Existentes
**Test 82: Store creada antes de migración**
- [ ] Query: `SELECT * FROM stores WHERE created_at < '2024-12-29'`
- [ ] Login en esa store
- [ ] **Esperado**: 
  - Banner NO aparece (onboardingDismissedAt o completedAt auto-seteado en migración)
  - POS funciona normalmente

---

### 9.2 Checkout
**Test 83: Checkout con producto importado en onboarding**
- [ ] Vender producto importado
- [ ] Completar checkout
- [ ] **Esperado**: Sale y SaleItems creados correctamente

---

### 9.3 Backups
**Test 84: Backup incluye onboarding data**
- [ ] Crear backup después de completar onboarding
- [ ] Verificar JSON contiene:
  - `store_settings.onboarding_completed_at`
  - `store_settings.ticket_header_line1`
  - Productos importados

---

## 📊 RESUMEN DE CRITERIOS DE ÉXITO

### Funcionalidad Core
- ✅ Wizard completo funciona end-to-end (6 pasos)
- ✅ CSV import con preview/confirm pattern
- ✅ Auto-generación de SKU para productos sin barcode
- ✅ Productos sin precio → isActive=false
- ✅ Banner aparece/desaparece correctamente
- ✅ OWNER-only mutations aplicadas

### No-Breaking
- ✅ POS sin cambios en flujo
- ✅ Inventario sin cambios
- ✅ Turnos sin cambios
- ✅ Reportes sin cambios
- ✅ Promociones/Cupones sin cambios
- ✅ Auditoría funcional
- ✅ Subscriptions sin cambios

### Performance
- ✅ Import 500 productos < 10 segundos
- ✅ Preview CSV < 2 segundos
- ✅ Navegación wizard instantánea

### UX
- ✅ Mobile responsive
- ✅ Accesibilidad (keyboard, screen reader)
- ✅ Errores claros y accionables
- ✅ Loading states visibles

---

## 🚀 DEPLOYMENT CHECKLIST

Antes de mergear a producción:

1. [ ] Todos los tests de FASE 1-9 passed
2. [ ] Migración aplicada en staging
3. [ ] 3 tiendas reales completaron onboarding en <30 min
4. [ ] No hay errores en Sentry/logs de últimas 24h
5. [ ] Feature flag `ONBOARDING_V1` habilitado en prod
6. [ ] Documentación actualizada (README, CHANGELOG)
7. [ ] Rollback plan documentado
8. [ ] Monitoring dashboard para métricas:
   - Tiempo promedio de completar onboarding
   - Tasa de abandono por paso
   - Errores en CSV import
   - Banner dismiss rate

---

**Fecha:** 2024-12-29
**Módulo:** 16.2 Onboarding
**Responsable:** [Tu Nombre]
