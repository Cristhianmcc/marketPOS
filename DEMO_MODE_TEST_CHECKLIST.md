# MÓDULO 17.4 - DEMO MODE - CHECKLIST DE TESTING

## ✅ Módulo Completado: DEMO MODE + RESET RÁPIDO

**Objetivo**: Permitir demostraciones comerciales con datos ficticios que se pueden resetear rápidamente.

**Fecha**: 30 de Diciembre de 2024

---

## 🎯 FUNCIONALIDADES IMPLEMENTADAS

### 1. Schema y Migración
- ✅ Agregado campo `isDemoStore` Boolean al modelo `Store`
- ✅ Default false para tiendas existentes
- ✅ Migración `20251230153826_add_demo_store_flag` aplicada

### 2. API de Activación (/api/admin/demo/enable)
- ✅ Endpoint POST para activar Demo Mode
- ✅ Validación SUPERADMIN only
- ✅ Validación de tienda no archivada
- ✅ Validación de que no esté ya en demo
- ✅ Transacción ACID para seed de datos
- ✅ Seed de 15 productos variados (Coca Cola, Inca Kola, Pan, Arroz, etc.)
- ✅ Seed de 4 productos marcados como quick-sell
- ✅ Seed de 1 cliente demo con phone
- ✅ Seed de 2 turnos (1 cerrado ayer, 1 abierto hoy)
- ✅ Seed de 3 ventas (CASH, YAPE, FIADO)
- ✅ Seed de 1 receivable con pago parcial
- ✅ Seed de 1 category promo (Bebidas 10%)
- ✅ Seed de 1 volume promo (Galletas 6x5)
- ✅ Seed de 1 coupon "DEMO10"
- ✅ Audit log con severity WARN

### 3. API de Reset (/api/admin/demo/reset)
- ✅ Endpoint POST para resetear Demo Mode
- ✅ Validación SUPERADMIN only
- ✅ Validación de que esté en demo mode
- ✅ Transacción ACID para eliminación segura
- ✅ Eliminación de receivablePayments
- ✅ Eliminación de receivables
- ✅ Eliminación de saleItems
- ✅ Eliminación de sales
- ✅ Eliminación de movements
- ✅ Eliminación de shifts
- ✅ Eliminación de customers
- ✅ Eliminación de categoryPromotions
- ✅ Eliminación de volumePromotions
- ✅ Eliminación de nthPromotions
- ✅ Eliminación de couponUsages
- ✅ Eliminación de coupons
- ✅ Reset de stock a valores iniciales por categoría
- ✅ Audit log con severity ERROR
- ✅ Respuesta con contadores de items eliminados

### 4. UI Panel (/admin/demo)
- ✅ Página exclusiva para SUPERADMIN
- ✅ Sección de activación con botón verde
- ✅ Sección de reset con botón rojo
- ✅ Confirmación doble para reset
- ✅ Advertencias de seguridad visibles
- ✅ Información de qué incluye Demo Mode
- ✅ Guía de uso paso a paso
- ✅ Estados de loading durante operaciones
- ✅ Toasts de confirmación/error
- ✅ Diseño responsive y táctil

### 5. Badge en POS
- ✅ Badge prominente cuando isDemoStore=true
- ✅ Estilo con gradiente y animación pulse
- ✅ Texto "DEMO MODE ACTIVO"
- ✅ Subtexto "Datos ficticios para demostración"
- ✅ Iconos de advertencia a ambos lados

### 6. Link en Dashboard
- ✅ Card en dashboard solo para SUPERADMIN
- ✅ Estilo destacado con gradiente amarillo-naranja
- ✅ Link directo a /admin/demo
- ✅ Descripción clara de funcionalidad

---

## 📋 TESTING CHECKLIST

### ❗ Pre-requisitos
- [ ] Usuario con rol SUPERADMIN debe estar logged in
- [ ] Tener acceso a una tienda de prueba (NO producción)
- [ ] Verificar que la migración `20251230153826_add_demo_store_flag` esté aplicada

---

## 🧪 TEST 1: ACTIVAR DEMO MODE

### Escenario 1.1: Activación exitosa desde UI
- [ ] Navegar a dashboard
- [ ] Verificar que aparece el card "⚡ Demo Mode" (solo SUPERADMIN)
- [ ] Click en card de Demo Mode
- [ ] Verificar que carga la página /admin/demo
- [ ] Verificar advertencias de seguridad visibles
- [ ] Verificar información de "¿Qué incluye Demo Mode?"
- [ ] Click en botón "Activar Demo"
- [ ] Verificar modal de confirmación
- [ ] Confirmar activación
- [ ] Verificar toast de éxito
- [ ] Verificar que el badge "DEMO MODE ACTIVO" aparece en la página
- [ ] Verificar que el botón cambia a "Ya Activo" y está deshabilitado

### Escenario 1.2: Verificar datos creados
- [ ] Ir a /inventory
- [ ] Verificar que hay 15 productos nuevos:
  - Coca Cola 500ml (Bebidas, S/3.50, stock 50)
  - Inca Kola 500ml (Bebidas, S/3.50, stock 50)
  - Pan Molde Bimbo (Panadería, S/8.00, stock 30)
  - Arroz Superior 1kg (Abarrotes, S/4.50, stock 80)
  - Azúcar Blanca 1kg (Abarrotes, S/3.80, stock 80)
  - Galletas Soda Field (Snacks, S/2.50, stock 100)
  - Cerveza Cusqueña (Bebidas, S/6.50, stock 50)
  - Leche Gloria 1L (Lácteos, S/5.20, stock 40)
  - Aceite Primor (Abarrotes, S/12.00, stock 80)
  - Fideos Don Vittorio (Abarrotes, S/2.80, stock 80)
  - Huevos x6 (Lácteos, S/7.00, stock 40)
  - Detergente Ariel (Limpieza, S/15.00, stock 25)
  - Papel Higiénico Elite (Limpieza, S/9.00, stock 25)
  - Atún Florida (Conservas, S/4.50, stock 60)
  - Yogurt Gloria 1L (Lácteos, S/6.50, stock 40)

- [ ] Ir a /pos
- [ ] Verificar el badge "⚡ DEMO MODE ACTIVO ⚡" prominente
- [ ] Verificar Quick Sell Grid muestra 4 productos (Coca Cola, Inca Kola, Pan, Arroz)

- [ ] Ir a /customers
- [ ] Verificar que existe "Cliente Demo" con phone 999000111
- [ ] Verificar balance pendiente de S/15.00

- [ ] Ir a /shifts
- [ ] Verificar 2 turnos:
  - Turno de ayer (cerrado): S/100 → S/150, ventas S/50
  - Turno de hoy (abierto): S/150 inicial

- [ ] Ir a /sales
- [ ] Verificar 3 ventas:
  - Venta 1: CASH, S/15.00 (2 Coca Cola + 1 Pan)
  - Venta 2: YAPE, S/25.50 (3 Inca Kola + 2 Arroz)
  - Venta 3: FIADO, S/30.00 (Cliente Demo, 2 Leche + 2 Azúcar)

- [ ] Ir a /receivables
- [ ] Verificar receivable de Cliente Demo:
  - Total: S/30.00
  - Pagado: S/15.00
  - Balance: S/15.00

- [ ] Ir a /category-promotions
- [ ] Verificar promo "Promo Demo Bebidas":
  - Categoría: Bebidas
  - Tipo: PERCENT
  - Descuento: 10%
  - Activa

- [ ] Ir a /volume-promotions
- [ ] Verificar promo "Promo Demo 6x5":
  - Producto: Galletas Soda Field
  - Cantidad requerida: 6
  - Descuento: 15%
  - Activa

- [ ] Ir a /coupons
- [ ] Verificar cupón "DEMO10":
  - Código: DEMO10
  - Tipo: PERCENT
  - Descuento: 10%
  - Compra mínima: S/20
  - Descuento máximo: S/10
  - Activo
  - Sin límite de usos

### Escenario 1.3: Activación vía API directa
- [ ] Abrir DevTools > Network
- [ ] POST /api/admin/demo/enable
- [ ] Verificar response 200:
  ```json
  {
    "demoEnabled": true,
    "message": "Demo Mode activado con datos ficticios"
  }
  ```
- [ ] Verificar audit log en /admin/audit:
  - Action: DEMO_ENABLE
  - Entity Type: STORE
  - Severity: WARN
  - User: SUPERADMIN email

### Escenario 1.4: Probar funcionalidad en Demo
- [ ] Ir a /pos
- [ ] Agregar productos al carrito
- [ ] Aplicar cupón "DEMO10" (requiere mín S/20)
- [ ] Verificar descuento aplicado
- [ ] Finalizar venta CASH
- [ ] Verificar venta creada exitosamente
- [ ] Verificar stock actualizado en /inventory

---

## 🧪 TEST 2: VALIDACIONES DE ACTIVACIÓN

### Escenario 2.1: Activación con usuario NO SUPERADMIN
- [ ] Logout del usuario SUPERADMIN
- [ ] Login con usuario OWNER (no superadmin)
- [ ] Verificar que el card "Demo Mode" NO aparece en dashboard
- [ ] Intentar acceder directo a /admin/demo (URL manual)
- [ ] Verificar redirección o error 403
- [ ] Intentar POST /api/admin/demo/enable vía DevTools
- [ ] Verificar response 403 "Forbidden"

### Escenario 2.2: Activación de tienda ya en Demo
- [ ] Con SUPERADMIN logged in
- [ ] Activar Demo Mode (si no está activo)
- [ ] Intentar activar nuevamente desde UI
- [ ] Verificar que botón está deshabilitado con texto "Ya Activo"
- [ ] Intentar POST /api/admin/demo/enable vía API
- [ ] Verificar response 400:
  ```json
  {
    "error": "La tienda ya está en Demo Mode"
  }
  ```

### Escenario 2.3: Activación de tienda archivada (si aplica)
- [ ] Archivar la tienda (si el sistema lo permite)
- [ ] Intentar activar Demo Mode
- [ ] Verificar response 400:
  ```json
  {
    "error": "No se puede activar Demo Mode en tienda archivada"
  }
  ```

---

## 🧪 TEST 3: RESETEAR DEMO MODE

### Escenario 3.1: Reset exitoso desde UI
- [ ] Con Demo Mode activo
- [ ] Ir a /admin/demo
- [ ] Verificar badge "DEMO MODE ACTIVO" visible
- [ ] Click en botón "Resetear Demo"
- [ ] Verificar modal de confirmación:
  - "⚠️ ¿Confirmas eliminar TODOS los datos?"
  - Botones: Cancelar / Sí, Eliminar
- [ ] Click en "Cancelar"
- [ ] Verificar que modal se cierra sin cambios
- [ ] Click nuevamente en "Resetear Demo"
- [ ] Click en "Sí, Eliminar"
- [ ] Verificar loading "Reseteando..."
- [ ] Verificar toast de éxito
- [ ] Verificar toast de resumen con items eliminados:
  - sales: 3 (o más si se hicieron ventas)
  - customers: 1
  - shifts: 2
  - receivables: 1
  - categoryPromotions: 1
  - volumePromotions: 1
  - coupons: 1

### Escenario 3.2: Verificar datos eliminados
- [ ] Ir a /sales
- [ ] Verificar que NO hay ventas demo (solo ventas reales si las había)

- [ ] Ir a /customers
- [ ] Verificar que "Cliente Demo" NO existe

- [ ] Ir a /shifts
- [ ] Verificar que los 2 turnos demo NO existen

- [ ] Ir a /receivables
- [ ] Verificar que NO hay receivables de Cliente Demo

- [ ] Ir a /category-promotions
- [ ] Verificar que "Promo Demo Bebidas" NO existe

- [ ] Ir a /volume-promotions
- [ ] Verificar que "Promo Demo 6x5" NO existe

- [ ] Ir a /coupons
- [ ] Verificar que "DEMO10" NO existe

- [ ] Ir a /inventory
- [ ] Verificar que los 15 productos demo NO fueron eliminados (productos se mantienen)
- [ ] Verificar que el stock de productos fue reseteado:
  - Bebidas: 50
  - Abarrotes: 80
  - Snacks: 100
  - Lácteos: 40
  - Limpieza: 25
  - Conservas: 60
  - Panadería: 30

### Escenario 3.3: Reset vía API directa
- [ ] Activar Demo Mode nuevamente
- [ ] Abrir DevTools > Network
- [ ] POST /api/admin/demo/reset
- [ ] Verificar response 200:
  ```json
  {
    "demoReset": true,
    "message": "Demo Mode reseteado exitosamente",
    "deletedData": {
      "sales": 3,
      "customers": 1,
      "shifts": 2,
      "receivables": 1,
      "categoryPromotions": 1,
      "volumePromotions": 1,
      "coupons": 1
    }
  }
  ```
- [ ] Verificar audit log en /admin/audit:
  - Action: DEMO_RESET
  - Entity Type: STORE
  - Severity: ERROR
  - User: SUPERADMIN email

---

## 🧪 TEST 4: VALIDACIONES DE RESET

### Escenario 4.1: Reset con usuario NO SUPERADMIN
- [ ] Logout del usuario SUPERADMIN
- [ ] Login con usuario OWNER (no superadmin)
- [ ] Intentar POST /api/admin/demo/reset vía DevTools
- [ ] Verificar response 403 "Forbidden"

### Escenario 4.2: Reset de tienda NO en Demo
- [ ] Con Demo Mode desactivado (o después de reset)
- [ ] Intentar POST /api/admin/demo/reset vía API
- [ ] Verificar response 400:
  ```json
  {
    "error": "La tienda no está en Demo Mode"
  }
  ```

---

## 🧪 TEST 5: BADGE EN POS

### Escenario 5.1: Badge visible en Demo Mode
- [ ] Activar Demo Mode
- [ ] Ir a /pos
- [ ] Verificar badge prominente:
  - Gradiente amarillo-naranja-rojo
  - Animación pulse
  - Texto: "⚡ DEMO MODE ACTIVO ⚡"
  - Subtexto: "Datos ficticios para demostración"
  - Iconos de advertencia a ambos lados
- [ ] Verificar que el badge es responsive (mobile/tablet/desktop)

### Escenario 5.2: Badge NO visible fuera de Demo
- [ ] Resetear Demo Mode
- [ ] Ir a /pos
- [ ] Verificar que el badge NO aparece
- [ ] Verificar que el POS funciona normal sin badge

---

## 🧪 TEST 6: LINK EN DASHBOARD

### Escenario 6.1: Link visible para SUPERADMIN
- [ ] Con SUPERADMIN logged in
- [ ] Ir a dashboard (/)
- [ ] Verificar card "⚡ Demo Mode":
  - Gradiente amarillo-naranja
  - Border amarillo
  - Shadow destacado
  - Texto: "Activar/resetear datos de demostración"
- [ ] Click en card
- [ ] Verificar redirección a /admin/demo

### Escenario 6.2: Link NO visible para otros usuarios
- [ ] Logout de SUPERADMIN
- [ ] Login con OWNER (no superadmin)
- [ ] Ir a dashboard (/)
- [ ] Verificar que el card "Demo Mode" NO aparece

---

## 🧪 TEST 7: INTEGRIDAD DE DATOS

### Escenario 7.1: Transacción ACID en Enable
- [ ] Simular error durante enable (modificar API temporalmente para lanzar error después de crear algunos productos)
- [ ] Intentar activar Demo Mode
- [ ] Verificar que NO se crearon datos parciales (todo o nada)
- [ ] Verificar que isDemoStore sigue en false

### Escenario 7.2: Transacción ACID en Reset
- [ ] Activar Demo Mode
- [ ] Simular error durante reset (modificar API para lanzar error a mitad del proceso)
- [ ] Intentar resetear
- [ ] Verificar que NO se eliminaron datos parciales (todo o nada)
- [ ] Verificar que todos los datos demo siguen intactos

### Escenario 7.3: Stock reset correcto
- [ ] Activar Demo Mode
- [ ] Modificar stock de algunos productos manualmente
- [ ] Resetear Demo Mode
- [ ] Verificar que el stock volvió a los valores iniciales por categoría

---

## 🧪 TEST 8: AUDIT LOG

### Escenario 8.1: Log de activación
- [ ] Activar Demo Mode
- [ ] Ir a /admin/audit
- [ ] Verificar registro:
  - Action: DEMO_ENABLE
  - Entity Type: STORE
  - Entity ID: {storeId}
  - User ID: {superadminId}
  - Severity: WARN
  - IP Address: registrada
  - User Agent: registrado
  - Timestamp: actual

### Escenario 8.2: Log de reset
- [ ] Resetear Demo Mode
- [ ] Ir a /admin/audit
- [ ] Verificar registro:
  - Action: DEMO_RESET
  - Entity Type: STORE
  - Entity ID: {storeId}
  - User ID: {superadminId}
  - Severity: ERROR
  - IP Address: registrada
  - User Agent: registrado
  - Timestamp: actual

---

## 🧪 TEST 9: RESPONSIVE Y TÁCTIL

### Escenario 9.1: UI en mobile
- [ ] Abrir /admin/demo en mobile (<768px)
- [ ] Verificar que todos los elementos son legibles
- [ ] Verificar que los botones son táctiles (>=44px)
- [ ] Verificar que el modal de confirmación es responsive
- [ ] Activar/resetear desde mobile
- [ ] Verificar funcionamiento correcto

### Escenario 9.2: UI en tablet
- [ ] Abrir /admin/demo en tablet (768-1023px)
- [ ] Verificar layout responsive
- [ ] Verificar grid de información de 2 columnas
- [ ] Activar/resetear desde tablet

### Escenario 9.3: UI en desktop
- [ ] Abrir /admin/demo en desktop (>=1024px)
- [ ] Verificar layout completo
- [ ] Verificar todos los elementos visibles sin scroll innecesario
- [ ] Activar/resetear desde desktop

---

## 🧪 TEST 10: CICLO COMPLETO DE DEMOSTRACIÓN

### Escenario 10.1: Simulación de demo comercial
- [ ] Activar Demo Mode
- [ ] Ir a /pos
- [ ] Verificar badge DEMO visible
- [ ] Agregar 3 productos al carrito usando Quick Sell
- [ ] Aplicar cupón DEMO10
- [ ] Finalizar venta CASH con S/50
- [ ] Ver vuelto calculado
- [ ] Confirmar venta
- [ ] Ir a /reports
- [ ] Verificar que la venta aparece en reportes
- [ ] Ir a /admin/demo
- [ ] Resetear Demo Mode
- [ ] Verificar que la venta demo fue eliminada
- [ ] Verificar que el sistema está limpio para la siguiente demo

---

## ✅ CRITERIOS DE ÉXITO

### Funcionalidad Core
- [ ] SUPERADMIN puede activar Demo Mode desde UI
- [ ] Se crean 15 productos, 3 ventas, 1 cliente, 2 turnos, promos y cupones
- [ ] Badge DEMO es visible en POS cuando está activo
- [ ] SUPERADMIN puede resetear Demo Mode desde UI
- [ ] Reset elimina TODOS los datos demo de forma segura
- [ ] Stock se resetea a valores iniciales por categoría

### Seguridad
- [ ] Solo SUPERADMIN puede acceder a /admin/demo
- [ ] Solo SUPERADMIN puede llamar APIs de demo
- [ ] Usuarios OWNER/CASHIER no ven el card en dashboard
- [ ] Validaciones de tienda archivada funcionan
- [ ] Validaciones de demo activo/inactivo funcionan

### Integridad de Datos
- [ ] Transacciones ACID en enable (todo o nada)
- [ ] Transacciones ACID en reset (todo o nada)
- [ ] No se afectan datos de producción
- [ ] Audit log registra todas las operaciones críticas

### UX y UI
- [ ] UI es intuitiva y fácil de usar
- [ ] Advertencias de seguridad son visibles
- [ ] Confirmaciones dobles previenen errores
- [ ] Toasts informativos en cada acción
- [ ] Responsive en mobile/tablet/desktop
- [ ] Loading states claros durante operaciones

---

## 🚨 BUGS CONOCIDOS / NOTAS

1. **Productos demo NO se eliminan en reset**: Esto es intencional. Los productos se mantienen pero su stock se resetea.
2. **Audit log con severity ERROR en reset**: Esto es intencional para destacar operaciones de eliminación masiva.
3. **UI requiere SUPERADMIN**: Acceso directo a URL /admin/demo debe validar permisos en el layout o middleware.

---

## 📊 MÉTRICAS DE TESTING

- **Total de casos de prueba**: ~80
- **Casos críticos (seguridad)**: ~15
- **Casos de integridad de datos**: ~10
- **Casos de UI/UX**: ~15
- **Casos de API**: ~20
- **Casos de ciclo completo**: ~20

---

## 🎯 PRÓXIMOS PASOS (Post-Testing)

1. [ ] Agregar telemetría de uso de Demo Mode (¿cuántas veces se activa/resetea?)
2. [ ] Agregar opción de "Seed personalizado" con diferentes datasets
3. [ ] Agregar límite de tiempo para Demo Mode (auto-reset después de X horas)
4. [ ] Agregar watermark "DEMO" en todas las páginas cuando está activo
5. [ ] Agregar reporte de "Actividad en Demo Mode" para análisis comercial

---

## ✅ COMPLETADO POR

- **Desarrollador**: GitHub Copilot
- **Revisor**: [Pendiente]
- **Fecha de Completado**: [Pendiente]
- **Firma**: ___________________

---

**IMPORTANTE**: Este módulo debe testearse en un ambiente de STAGING/DEV, NUNCA en producción. Los datos demo deben ser claramente ficticios y no confundibles con datos reales.
