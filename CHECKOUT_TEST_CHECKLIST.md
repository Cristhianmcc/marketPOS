# Checklist de Pruebas - /api/sales/checkout

## 🎯 Objetivo
Validar que el checkout maneja correctamente todos los casos de error y escenarios de concurrencia.

---

## � **PRUEBAS RÁPIDAS DESDE NAVEGADOR (DevTools)**

### Preparación:
1. Abre http://localhost:3000/pos
2. Abre DevTools (F12)
3. Ve a la pestaña "Console"
4. Copia y pega los comandos de abajo

---

### ✅ **CHECK 1: Errores NO devuelven 500**

#### Test 1.1 - Carrito vacío (debe devolver 400):
```javascript
fetch('/api/sales/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items: [] })
})
.then(r => r.json().then(data => ({status: r.status, data})))
.then(console.log)
```
**Esperado:** `status: 400`, `code: "EMPTY_CART"`

---

#### Test 1.2 - Producto inexistente (debe devolver 400):
```javascript
fetch('/api/sales/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    items: [{ storeProductId: 'producto-falso-xxx', quantity: 1, unitPrice: 10 }] 
  })
})
.then(r => r.json().then(data => ({status: r.status, data})))
.then(console.log)
```
**Esperado:** `status: 400`, `code: "PRODUCT_NOT_FOUND"`

---

#### Test 1.3 - Formato inválido (debe devolver 400):
```javascript
fetch('/api/sales/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    items: [{ quantity: 1, unitPrice: 10 }]  // falta storeProductId
  })
})
.then(r => r.json().then(data => ({status: r.status, data})))
.then(console.log)
```
**Esperado:** `status: 400`, `code: "INVALID_ITEM_FORMAT"`

---

### ✅ **CHECK 2: Retry de saleNumber (concurrencia)**

1. **Abre 2 pestañas** de http://localhost:3000/pos
2. En cada pestaña:
   - Busca productos
   - Agrega 1-2 productos al carrito
3. **Haz clic en "Finalizar Venta" casi al mismo tiempo** en ambas pestañas
4. Verifica en ambas:
   - ✅ Toast verde "Venta completada"
   - ✅ Sale numbers diferentes (ej: #5 y #6)

**Verificar en base de datos:**
```bash
npm run studio
# Ver tabla "Sale" - debe haber 2 ventas con saleNumber consecutivos y únicos
```

---

### ✅ **CHECK 3: Cliente maneja errores (UX)**

#### Test 3.1 - Stock insuficiente:
1. En POS, busca un producto con poco stock
2. Agrega al carrito MÁS unidades de las disponibles
3. Haz checkout
4. Verifica:
   - ✅ Toast rojo con mensaje claro
   - ✅ Muestra "Disponible: X | Solicitado: Y"
   - ✅ Botón vuelve a estado normal
   - ✅ Carrito NO se vacía

#### Test 3.2 - Cantidad decimal en producto UNIT:
1. Busca producto tipo UNIT
2. Agrega al carrito
3. Edita cantidad manualmente a "1.5" en el input
4. Haz checkout
5. Verifica:
   - ✅ Toast rojo con mensaje de error
   - ✅ Carrito permanece intacto

#### Test 3.3 - Producto desactivado:
1. Agrega productos al carrito
2. Ve a /inventory y DESACTIVA uno de los productos del carrito
3. Vuelve a /pos y haz checkout
4. Verifica:
   - ✅ Toast de error
   - ✅ Carrito permanece para que puedas quitar el producto inválido

---

## 📋 **Checklist Completo de Validaciones**

### 1. UNIT - Stock Insuficiente
**Escenario:** Producto tipo UNIT con stock menor a la cantidad solicitada

**Pasos:**
1. Ir a Inventario y verificar stock de un producto UNIT (ej: "Coca Cola" con stock 2)
2. Ir a POS y buscar ese producto
3. Agregar 3 unidades al carrito
4. Hacer checkout

**Resultado Esperado:**
- HTTP 409 (Conflict)
- JSON:
  ```json
  {
    "code": "INSUFFICIENT_STOCK",
    "message": "Coca Cola: stock insuficiente",
    "details": {
      "productId": "...",
      "productName": "Coca Cola",
      "requested": 3,
      "available": 2
    }
  }
  ```

**Toast:** ❌ "Coca Cola: stock insuficiente"

---

### 2. UNIT - Cantidad Decimal Inválida
**Escenario:** Producto tipo UNIT con cantidad decimal (ej: 1.5)

**Pasos:**
1. Buscar producto UNIT en POS
2. Agregar al carrito
3. Editar cantidad manualmente a 1.5
4. Hacer checkout

**Resultado Esperado:**
- HTTP 400 (Bad Request)
- JSON:
  ```json
  {
    "code": "INVALID_QUANTITY",
    "message": "Producto X: cantidad debe ser entera para productos tipo UNIT",
    "details": {
      "productId": "...",
      "productName": "...",
      "quantity": 1.5
    }
  }
  ```

**Toast:** ❌ Error mensaje

**Nota:** La validación frontend debería prevenirlo, pero backend debe rechazarlo.

---

### 3. KG - Cantidad Decimal Válida
**Escenario:** Producto tipo KG con cantidad decimal (ej: 0.5, 2.3)

**Pasos:**
1. Buscar producto KG en POS (ej: "Arroz a Granel")
2. Agregar al carrito
3. Modificar cantidad a 0.5 kg usando botones -/+
4. Agregar otro producto KG con 2.3 kg (editar input)
5. Hacer checkout

**Resultado Esperado:**
- HTTP 201 (Created)
- JSON:
  ```json
  {
    "success": true,
    "saleId": "...",
    "saleNumber": 1,
    "total": 15.60,
    "itemCount": 2
  }
  ```

**Toast:** ✅ "¡Venta completada! Total: S/ 15.60"

**Validación adicional:**
- Ir a Inventario y verificar que el stock se descontó correctamente
- Verificar en DB que Movement tiene quantity negativo decimal

---

### 4. Checkout Simultáneo (Race Condition)
**Escenario:** Dos pestañas intentan hacer checkout al mismo tiempo (colisión de saleNumber)

**Pasos:**
1. Abrir 2 pestañas del POS en el mismo navegador
2. En pestaña 1: Agregar producto al carrito
3. En pestaña 2: Agregar producto al carrito
4. **SIN RECARGAR**, hacer checkout en ambas pestañas casi simultáneamente (dentro de 1-2 segundos)

**Resultado Esperado:**
- Ambas ventas deben completarse exitosamente
- Los `saleNumber` deben ser consecutivos (ej: #5 y #6)
- Una de ellas debería haber disparado el retry interno
- Verificar en consola del server logs: `"Sale number collision detected, retrying..."`

**Validación adicional:**
```sql
SELECT id, sale_number, total, created_at 
FROM sales 
WHERE store_id = '...' 
ORDER BY sale_number DESC 
LIMIT 5;
```
Deben aparecer ambas ventas con números únicos.

---

### 5. Carrito Vacío
**Escenario:** Intentar checkout sin productos en el carrito

**Pasos:**
1. Ir a POS con carrito vacío
2. Hacer clic en "Finalizar Venta"

**Resultado Esperado:**
- Frontend previene la llamada (toast: "El carrito está vacío")
- Si se llama al API directamente: HTTP 400
  ```json
  {
    "code": "EMPTY_CART",
    "message": "El carrito está vacío"
  }
  ```

---

### 6. Usuario No Autenticado
**Escenario:** Token de sesión expirado o ausente

**Pasos:**
1. Abrir DevTools > Application > Cookies
2. Eliminar la cookie de sesión
3. Intentar hacer checkout

**Resultado Esperado:**
- HTTP 401 (Unauthorized)
- JSON:
  ```json
  {
    "code": "UNAUTHORIZED",
    "message": "No autenticado"
  }
  ```

---

### 7. Usuario Sin Permisos (si implementas otros roles)
**Escenario:** Usuario con rol que no puede vender

**Pasos:**
1. Crear usuario con rol diferente a OWNER/CASHIER (futuro)
2. Intentar hacer checkout

**Resultado Esperado:**
- HTTP 403 (Forbidden)
- JSON:
  ```json
  {
    "code": "FORBIDDEN",
    "message": "No tienes permisos para realizar ventas",
    "details": {
      "requiredRoles": ["OWNER", "CASHIER"]
    }
  }
  ```

---

### 8. Producto Inactivo Durante Checkout
**Escenario:** Producto se desactiva mientras está en el carrito

**Pasos:**
1. Agregar producto al carrito en POS
2. En otra pestaña, ir a Inventario y desactivar ese producto
3. Volver al POS e intentar checkout

**Resultado Esperado:**
- HTTP 400 (Bad Request)
- JSON:
  ```json
  {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Algunos productos no existen o están inactivos"
  }
  ```

---

### 9. Stock Cambia Durante Checkout
**Escenario:** Stock se agota entre agregar al carrito y hacer checkout

**Pasos:**
1. Producto con stock 1
2. Pestaña 1: Agregar 1 unidad al carrito
3. Pestaña 2: Agregar 1 unidad al carrito
4. Pestaña 1: Hacer checkout (✅ éxito, stock queda en 0)
5. Pestaña 2: Hacer checkout

**Resultado Esperado Pestaña 2:**
- HTTP 409 (Conflict)
- JSON:
  ```json
  {
    "code": "INSUFFICIENT_STOCK",
    "message": "Producto X: stock insuficiente",
    "details": {
      "requested": 1,
      "available": 0
    }
  }
  ```

---

## 🔍 Validaciones en Base de Datos

Después de ejecutar los casos exitosos, validar:

```sql
-- 1. Verificar que saleNumber es único y secuencial
SELECT sale_number, COUNT(*) as count
FROM sales 
WHERE store_id = '...'
GROUP BY sale_number
HAVING COUNT(*) > 1;
-- Debe retornar 0 filas

-- 2. Verificar que cada venta tiene movements
SELECT s.id, s.sale_number, COUNT(m.id) as movement_count
FROM sales s
LEFT JOIN movements m ON m.notes LIKE CONCAT('Venta #', s.sale_number)
WHERE s.store_id = '...'
GROUP BY s.id
HAVING movement_count = 0;
-- Debe retornar 0 filas (todas las ventas tienen movements)

-- 3. Verificar integridad de stock
SELECT sp.id, pm.name, sp.stock, 
       COALESCE(SUM(m.quantity), 0) as total_movements
FROM store_products sp
JOIN products_master pm ON pm.id = sp.product_id
LEFT JOIN movements m ON m.store_product_id = sp.id
WHERE sp.store_id = '...'
GROUP BY sp.id;
-- stock inicial + sum(movements) debe coincidir con stock actual
```

---

## 📊 Métricas de Éxito

- [ ] 0 errores HTTP 500 en casos normales
- [ ] Todos los códigos HTTP son semánticamente correctos
- [ ] Formato JSON de error consistente en todos los casos
- [ ] Retry de saleNumber funciona sin errores
- [ ] No hay duplicados en saleNumber
- [ ] Stock siempre consistente después de checkout
- [ ] Movements creados para todas las ventas exitosas
- [ ] Frontend muestra mensajes de error claros

---

## 🐛 Bugs Conocidos / Limitaciones

- **Cantidad 0:** Frontend permite cantidad 0 temporalmente (se elimina del carrito). Backend rechaza con 400.
- **Retry saleNumber:** Solo 1 reintento. Si hay 3+ checkouts simultáneos, el 3ro podría fallar.
- **Stock sin control:** Si `stock = null`, no se valida disponibilidad (diseño intencional para productos sin control de inventario).

---

## 🚀 Ejecución Rápida

```bash
# Terminal 1: Server
npm run dev

# Terminal 2: Abrir múltiples pestañas
start http://localhost:3000/pos
start http://localhost:3000/pos
start http://localhost:3000/pos
```

**Tiempo estimado:** 15-20 minutos para completar todos los casos.
