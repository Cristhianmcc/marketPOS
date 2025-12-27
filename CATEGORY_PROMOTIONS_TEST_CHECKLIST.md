# ✅ CHECKLIST DE PRUEBAS - MÓDULO 14.2-B: PROMOCIONES POR CATEGORÍA

**Estado**: ✅ Implementación completada - Listo para testing  
**Fecha**: 26 de Diciembre, 2024

---

## 📋 CHECKLIST DE 12 PUNTOS (Según Especificación)

### 🔹 TEST 1: Crear promoción 10% en categoría "Bebidas"
- [ ] Ir a `/category-promotions`
- [ ] Crear nueva promoción:
  - Nombre: "10% Bebidas"
  - Categoría: "Bebidas"
  - Tipo: PERCENT
  - Valor: 10
  - Activa: Sí
- [ ] **Verificar**: Aparece en la lista con estado "Activa" (badge verde)

### 🔹 TEST 2: Vender producto sin promo de producto → Category promo aplica
- [ ] Ir a POS
- [ ] Agregar producto categoría "Bebidas" sin promo de producto
  - Ejemplo: Coca Cola 500ml, precio S/3.00
- [ ] **Verificar**:
  - Badge morado "CAT: 10% Bebidas" aparece en el item
  - Descuento: -S/0.30 (10% de S/3.00)
  - Total: S/2.70

### 🔹 TEST 3: Producto con promo de producto + category promo
- [ ] Crear promo de producto: 2x1 en Coca Cola (si no existe)
- [ ] Agregar 2 Coca Colas (activa 2x1)
- [ ] **Verificar orden de aplicación**:
  - Subtotal: S/6.00 (2 × S/3.00)
  - Promo producto (2x1): -S/3.00 → Subtotal después: S/3.00
  - Category promo (10%): -S/0.30 (10% de S/3.00)
  - Total línea: S/2.70
- [ ] **Verificar display en POS**:
  - Badge azul: "2x1 Bebidas" con -S/3.00
  - Badge morado: "CAT: 10% Bebidas" con -S/0.30

### 🔹 TEST 4: Promo AMOUNT (S/1 fijo) con qty 3
- [ ] Crear nueva promo:
  - Nombre: "S/1 off Bebidas"
  - Categoría: "Bebidas"
  - Tipo: AMOUNT
  - Valor: 1.00
  - Activa: Sí
- [ ] Desactivar promo del Test 1 (10%)
- [ ] Agregar 3 Coca Colas (sin promo 2x1)
- [ ] **Verificar**:
  - Subtotal: S/9.00 (3 × S/3.00)
  - Category promo: -S/3.00 (S/1.00 × 3 unidades)
  - Total: S/6.00

### 🔹 TEST 5: Promo con vigencia (startsAt/endsAt) → Aplica solo en rango
- [ ] Crear nueva promo:
  - Nombre: "Black Friday Bebidas"
  - Categoría: "Bebidas"
  - Tipo: PERCENT
  - Valor: 20
  - **Fecha inicio**: Hoy 00:00
  - **Fecha fin**: Mañana 23:59
  - Activa: Sí
- [ ] Desactivar otras promos de Bebidas
- [ ] Vender una Coca Cola
- [ ] **Verificar**: Descuento 20% aplica (-S/0.60)

### 🔹 TEST 6: Promo expirada no aplica
- [ ] Editar promo "Black Friday Bebidas":
  - **Fecha fin**: Ayer 23:59
- [ ] Refrescar POS
- [ ] Vender una Coca Cola
- [ ] **Verificar**:
  - NO aparece badge de category promo
  - Precio: S/3.00 (sin descuento)
- [ ] **Verificar Admin UI**:
  - Badge "Expirada" (rojo) en la tarjeta de la promo

### 🔹 TEST 7: Category promo + manual discount + cupón → Orden correcto
- [ ] Activar promo "10% Bebidas"
- [ ] Agregar Coca Cola (S/3.00)
- [ ] **Aplicar descuento manual** al ítem: 10% adicional
- [ ] **Aplicar cupón global**: "VERANO25" 5% (crear si no existe)
- [ ] **Verificar orden y cálculos**:
  1. Subtotal: S/3.00
  2. Category promo (10%): -S/0.30 → Base: S/2.70
  3. Descuento manual (10% de S/2.70): -S/0.27 → Subtotal ítem: S/2.43
  4. Cupón global (5% de S/2.43): -S/0.12
  5. **Total final**: S/2.31
- [ ] **Verificar totales en POS**:
  - Subtotal: S/3.00
  - Promos Categoría: -S/0.30
  - Desc. ítems: -S/0.27
  - Cupón VERANO25: -S/0.12
  - **Total**: S/2.31

### 🔹 TEST 8: Ticket muestra "CAT {name}"
- [ ] Completar venta del Test 7
- [ ] Abrir ticket (recibo imprimible)
- [ ] **Verificar formato 80mm**:
  ```
  Coca Cola 500ml
  1 und x 3.00                         3.00
  Promo: 10% Bebidas                  -0.30
  CAT 10% Bebidas                     -0.30  ← ✅ VERIFICAR ESTA LÍNEA
  Desc: 10%                           -0.27
  Total línea:                         2.43
  ```
- [ ] **Verificar totales**:
  ```
  Subtotal:                            3.00
  Descuentos:                         -0.57
  Cupón VERANO25:                     -0.12
  ──────────────────────────────────────
  TOTAL:                               2.31
  ```

### 🔹 TEST 9: CSV items incluye 3 columnas de category promo
- [ ] Ir a `/reports` → Tab "Exportar"
- [ ] Seleccionar rango de fechas (hoy)
- [ ] Descargar **"Exportar Items (CSV)"**
- [ ] Abrir CSV en Excel
- [ ] **Verificar columnas existen** (después de "Promo Monto"):
  1. **Cat Promo Nombre**: "10% Bebidas"
  2. **Cat Promo Tipo**: "Porcentaje"
  3. **Cat Promo Monto**: "0.30"
- [ ] **Verificar valores correctos** para el ítem de Coca Cola

### 🔹 TEST 10: Reportes suman category promos correctamente
- [ ] Ir a `/reports` → Tab "Resumen"
- [ ] Seleccionar rango de fechas (hoy)
- [ ] Buscar **"Generar Reporte"**
- [ ] **Verificar card morada** "Promos Categoría":
  - Monto total: S/0.60 (si vendiste 2 items con S/0.30 c/u)
  - Color: Purple-50 background, purple-200 border
  - Icono: Tag (lucide-react)
- [ ] **Verificar cálculo**:
  - Suma de todos los `categoryPromoDiscount` del período

### 🔹 TEST 11: FIADO incluye descuento de category promo
- [ ] Crear cliente de prueba: "Juan Pérez" (si no existe)
- [ ] Activar promo "10% Bebidas"
- [ ] Agregar Coca Cola (S/3.00) al carrito
- [ ] **Método de pago**: FIADO
- [ ] Seleccionar cliente "Juan Pérez"
- [ ] Completar venta
- [ ] Ir a `/receivables`
- [ ] **Verificar cuenta por cobrar**:
  - Monto: S/2.70 (S/3.00 - S/0.30 de category promo)
  - Cliente: Juan Pérez
  - Estado: Pendiente
- [ ] **Verificar total incluye descuento**:
  - Receivable.total = Sale.total (después de category promo)

### 🔹 TEST 12: Anulación revierte stock, total = 0 (sin reversal especial)
- [ ] Vender 1 Coca Cola con category promo activo
  - Total: S/2.70 (S/3.00 - S/0.30)
- [ ] Verificar stock de Coca Cola (antes de anular)
- [ ] **Anular venta** desde `/sales`
- [ ] **Verificar stock revierte**:
  - Stock aumentó en +1
- [ ] **Verificar ticket de venta anulada**:
  - Sale.total = 0
  - Marca **"VENTA ANULADA"**
  - Ítems muestran cantidades, pero total = 0
- [ ] **Nota**: Category promos NO necesitan reversal especial
  - Los descuentos están en snapshot histórico
  - Al anular, total = 0 pero no se "revierten" los descuentos
  - Es solo registro histórico

---

## 🎯 PRUEBAS ADICIONALES RECOMENDADAS

### ✅ A. Mejor promo (máximo descuento) si múltiples coinciden
- [ ] Crear 2 promos activas en "Bebidas":
  1. 10% descuento
  2. 15% descuento
- [ ] Vender Coca Cola
- [ ] **Verificar**: Aplica 15% (la mejor)

### ✅ B. Case-insensitive category matching
- [ ] Crear promo con categoría: "bebidas" (minúsculas)
- [ ] Vender producto categoría: "BEBIDAS" (mayúsculas)
- [ ] **Verificar**: Promo aplica (case-insensitive)

### ✅ C. maxDiscountPerItem cap
- [ ] Crear promo:
  - Tipo: PERCENT
  - Valor: 50%
  - **maxDiscountPerItem**: 1.00
- [ ] Vender producto S/10.00
- [ ] **Verificar**:
  - Sin cap: 50% = -S/5.00
  - Con cap: Aplica máximo -S/1.00

### ✅ D. Promo no aplica si categoría no coincide
- [ ] Crear promo: "10% Bebidas"
- [ ] Vender producto categoría "Snacks"
- [ ] **Verificar**: NO aplica descuento

### ✅ E. Múltiples items con diferentes category promos
- [ ] Crear promos:
  1. 10% Bebidas
  2. 5% Snacks
- [ ] Vender:
  - 1 Coca Cola (Bebidas) → -10%
  - 1 Papas Lays (Snacks) → -5%
- [ ] **Verificar totales en POS**:
  - Promos Categoría: Suma de ambos descuentos

---

## 📊 RESUMEN DE IMPLEMENTACIÓN

### ✅ Completado:
- [x] Schema: CategoryPromotion model + SaleItem snapshot fields
- [x] Migration: `20251226044652_add_category_promotions`
- [x] Library: `src/lib/categoryPromotions.ts` (validation logic)
- [x] Checkout: ACID integration with async Promise.all
- [x] APIs: CRUD endpoints (GET, POST, PATCH, DELETE)
- [x] Admin UI: `/category-promotions` (grid, create modal, toggle, delete)
- [x] Navigation: Navbar link + home page card
- [x] POS UI: Purple badge "CAT: {name}" + totals
- [x] Tickets: "CAT {name}" line per item
- [x] Reports: Purple card for totalCategoryPromotions
- [x] CSV: 3 new columns (Cat Promo Nombre, Tipo, Monto)
- [x] Build: ✅ Successful compilation

### ⏳ Pendiente:
- [ ] Ejecutar los 12 tests del checklist
- [ ] Verificar edge cases (A-E)
- [ ] Deploy a producción (después de testing completo)

---

## 🚀 ORDEN RECOMENDADO DE TESTING

1. **Tests básicos** (1-4): Funcionalidad core
2. **Tests de vigencia** (5-6): Validación de fechas
3. **Test de orden** (7): Integración completa
4. **Tests de display** (8-9): UI y exports
5. **Tests de reportes** (10): Agregaciones
6. **Tests de casos especiales** (11-12): FIADO y anulación
7. **Pruebas adicionales** (A-E): Edge cases

**Tiempo estimado total**: 45-60 minutos

---

## 📝 NOTAS IMPORTANTES

1. **ACID Transactions**: Mantenidas en checkout, no hay cambios en estructura de transacciones
2. **Async Computation**: Category promos calculados en paralelo vía `Promise.all`
3. **Orden de descuentos**: Product promo → **Category promo** → Manual discount → Global → Coupon
4. **Snapshot approach**: Todos los datos de category promo guardados en `SaleItem` para integridad histórica
5. **Case-insensitive**: Categorías coinciden sin importar mayúsculas/minúsculas
6. **Best promo selection**: Si múltiples promos coinciden, se elige la de mayor descuento

---

**READY TO TEST! 🎉**
