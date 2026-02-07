# MÓDULO F3 — Servicios Ferretería (sin stock) + Venta Mixta

**Fecha:** 2026-02-05  
**Estado:** ✅ COMPLETADO  

---

## 📋 Resumen

Este módulo permite a ferreterías vender **servicios** como:
- Corte de materiales
- Soldadura  
- Instalación
- Delivery
- Reparaciones

Los servicios **NO decrementan stock** pero **SÍ generan SaleItems** para registro contable.

---

## 🗄️ Cambios en Schema

### Nuevo modelo `Service`
```prisma
model Service {
  id        String   @id @default(cuid())
  storeId   String
  name      String
  price     Decimal  @db.Decimal(10, 2)
  taxable   Boolean  @default(false)
  active    Boolean  @default(true)
  store     Store    @relation(fields: [storeId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([storeId, name])
  @@index([storeId])
}
```

### Cambios en `SaleItem`
- `storeProductId` ahora es **opcional** (nullable)
- Nuevo campo `serviceId String?`
- Nuevo campo `isService Boolean @default(false)`
- Nueva relación `service Service?`

### Cambios en `Store`
- Nueva relación `services Service[]`

---

## 🔌 API Endpoints

### `GET /api/services`
Lista servicios de la tienda.

**Query params:**
- `q`: Búsqueda por nombre
- `active`: Filtrar solo activos (`true`/`false`)

**Respuesta:**
```json
{
  "data": [
    { "id": "...", "name": "Corte", "price": "5.00", "taxable": false, "active": true }
  ],
  "count": 1
}
```

### `POST /api/services`
Crea un nuevo servicio. Solo OWNER.

**Body:**
```json
{
  "name": "Soldadura",
  "price": 25.00,
  "taxable": false
}
```

### `PATCH /api/services`
Actualiza un servicio existente. Solo OWNER.

**Body:**
```json
{
  "id": "clu...",
  "name": "Soldadura Pro",
  "price": 30.00,
  "active": true
}
```

### `DELETE /api/services`
Elimina un servicio. 
- Si tiene ventas asociadas: soft-delete (`active: false`)
- Si no tiene ventas: hard-delete

**Body:**
```json
{
  "id": "clu..."
}
```

---

## 🛒 Flujo POS

### Tabs en QuickSell
Cuando `ENABLE_SERVICES` está activo:
1. Aparecen tabs "Productos" y "Servicios"
2. Tab Servicios muestra grid con servicios activos
3. Click en servicio lo agrega al carrito

### Cart con servicios
- Los servicios aparecen con label "(Servicio)"
- Cantidad por defecto: 1 (editable)
- No muestran stock

### Checkout mixto
El carrito puede tener productos y servicios simultáneamente:
```json
{
  "items": [
    { "storeProductId": "...", "quantity": 2, "unitPrice": 15.00 },
    { "isService": true, "serviceId": "...", "serviceName": "Corte", "quantity": 1, "unitPrice": 5.00 }
  ],
  "paymentMethod": "CASH",
  "amountPaid": 40.00
}
```

---

## 🚫 Lo que NO hacen los servicios

1. **NO decrementan stock** - No tienen inventario
2. **NO aplican promociones** - Sin promo pack/volumen/nth
3. **NO crean Movements** - Sin registro de movimiento de inventario
4. **NO tienen unidades** - Siempre se venden como UNIT

---

## ✅ Feature Flag

**Key:** `ENABLE_SERVICES`

| Estado | Comportamiento |
|--------|----------------|
| OFF | API retorna 403, tab no visible en POS |
| ON | CRUD habilitado, tab visible, checkout acepta servicios |

---

## �️ Página de Gestión de Servicios

**Ruta:** `/inventory/services`

### Acceso
- Desde Inventario, botón "Servicios" (visible solo si ENABLE_SERVICES=ON)
- Solo OWNER puede crear/editar/eliminar servicios

### Funcionalidades
- Lista de todos los servicios con filtro por nombre y estado (activo/inactivo)
- Crear nuevo servicio con nombre, precio y flag de gravado (IGV)
- Editar servicio existente
- Activar/desactivar servicio
- Eliminar servicio (soft-delete si tiene ventas)

---

## �📁 Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `prisma/schema.prisma` | Model Service, SaleItem extendido, Store relación |
| `src/app/api/services/route.ts` | CRUD completo con flag guard |
| `src/app/pos/page.tsx` | Tabs, grid servicios, addServiceToCart |
| `src/app/api/sales/checkout/route.ts` | Separar productos/servicios, crear SaleItems diferenciados |
| `src/app/inventory/services/page.tsx` | **NUEVO** Página de gestión de servicios |
| `src/app/inventory/page.tsx` | Botón link a servicios (si flag ON) |

---

## 🧪 Checklist de Pruebas

### Setup
- [ ] Flag `ENABLE_SERVICES` activado para la tienda
- [ ] Al menos 2-3 servicios creados (Corte, Soldadura, Delivery)

### CRUD Servicios
- [ ] **Crear:** POST `/api/services` crea servicio correctamente
- [ ] **Listar:** GET `/api/services` retorna servicios activos
- [ ] **Buscar:** GET `/api/services?q=corte` filtra por nombre
- [ ] **Editar:** PATCH actualiza nombre/precio/active
- [ ] **Eliminar:** DELETE soft-delete si tiene ventas, hard-delete si no

### POS UI
- [ ] Con flag OFF: Tab servicios NO visible
- [ ] Con flag ON: Tabs "Productos | Servicios" visibles
- [ ] Click en servicio lo agrega al carrito
- [ ] Servicio en carrito muestra "(Servicio)"
- [ ] Cantidad editable, precio correcto

### Checkout
- [ ] Venta solo servicios: Completa sin errores
- [ ] Venta mixta (productos + servicios): Completa correctamente
- [ ] Stock de productos decrementado, servicios sin efecto en stock
- [ ] Ticket muestra productos y servicios diferenciados
- [ ] Movement creado solo para productos, no para servicios

### Edge Cases
- [ ] Servicio inactivo no aparece en POS
- [ ] No se puede crear servicio con nombre duplicado
- [ ] CASHIER no puede crear/editar servicios (403)

---

## 📊 Ejemplo de Venta Mixta

**Carrito:**
| Item | Tipo | Qty | Precio | Subtotal |
|------|------|-----|--------|----------|
| Tubo PVC 1" | Producto | 3 | S/ 12.00 | S/ 36.00 |
| Corte | Servicio | 2 | S/ 5.00 | S/ 10.00 |
| Delivery | Servicio | 1 | S/ 8.00 | S/ 8.00 |

**Total:** S/ 54.00

**Resultado:**
- Stock Tubo PVC: -3
- Stock Corte: N/A (servicio)
- Stock Delivery: N/A (servicio)
- SaleItems: 3 registros creados
- Movements: 1 registro (solo Tubo PVC)

---

## 🎯 Siguiente Módulo

**F4 — Compra Crédito Ferretería + Balance Proveedores**
