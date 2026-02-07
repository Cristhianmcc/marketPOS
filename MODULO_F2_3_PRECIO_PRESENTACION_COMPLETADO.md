# ═══════════════════════════════════════════════════════════════════════════
# MÓDULO F2.3 — PRECIO POR PRESENTACIÓN / UNIDAD DE VENTA (OVERRIDE)
# ═══════════════════════════════════════════════════════════════════════════
**Status:** ✅ COMPLETADO
**Fecha:** $(date)
**Requisitos previos:** F2.2 (Conversiones de Unidades)

## DESCRIPCIÓN

Permite definir un "precio especial" al vender en una unidad de venta diferente
a la base. Por ejemplo:

- Producto: Clavo 2" 
- Precio base: S/ 0.50 / unidad
- Conversión: 1 CAJA = 12 unidades → Precio normal: S/ 6.00
- **Precio pack especial:** CAJA S/ 5.00 (ahorro S/ 1.00)

### REGLA CLAVE
El precio especial de la presentación aplica **ANTES** de:
- Promociones por producto
- Promociones por categoría
- Promociones por volumen
- Promociones n-ésimo
- Descuentos manuales
- Cupones

Es decir, el subtotalItem se calcula con el precio especial como nueva "base".

## CAMBIOS IMPLEMENTADOS

### 1. Schema (prisma/schema.prisma)

```prisma
enum PricingMode {
  BASE_UNIT         // Precio calculado: quantityBase × unitPrice
  SELL_UNIT_OVERRIDE // Precio pack: quantityOriginal × sellUnitPrice
}

model SellUnitPrice {
  id               String   @id @default(uuid())
  storeId          String
  productMasterId  String
  sellUnitId       String
  price            Decimal  @db.Decimal(12,4)
  active           Boolean  @default(true)
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  store            Store    @relation(fields: [storeId])
  product          Product  @relation(fields: [productMasterId])
  sellUnit         Unit     @relation(fields: [sellUnitId])

  @@unique([storeId, productMasterId, sellUnitId])
}

// SaleItem snapshot
model SaleItem {
  // ... campos existentes ...
  pricingMode            PricingMode?
  sellUnitPriceApplied   Decimal?    @db.Decimal(12,4)
}
```

### 2. Feature Flag

```
ENABLE_SELLUNIT_PRICING
- Nombre: "Precio por Unidad de Venta"
- Descripción: "Permite definir precios especiales por presentación"
- Requiere: ENABLE_CONVERSIONS
```

### 3. APIs

#### GET /api/units/sell-prices?productMasterId=xxx
Lista precios especiales de un producto.

**Response:**
```json
{
  "prices": [
    {
      "id": "uuid",
      "sellUnitId": "uuid",
      "price": 5.00,
      "active": true,
      "notes": "Promoción pack",
      "sellUnit": { "id": "", "sunatCode": "NIU", "symbol": "CAJA" }
    }
  ]
}
```

#### POST /api/units/sell-prices
Crear/upsert precio especial.

**Body:**
```json
{
  "productMasterId": "uuid",
  "sellUnitId": "uuid",
  "price": 5.00,
  "notes": "Opcional"
}
```

#### PATCH /api/units/sell-prices/[id]
Actualizar precio existente.

**Body:**
```json
{
  "price": 4.50,
  "notes": "Nuevo precio",
  "active": true
}
```

#### DELETE /api/units/sell-prices/[id]
Eliminar precio especial (vuelve a calculado).

### 4. Checkout (checkout/route.ts)

```typescript
// Si tiene conversión y flag activo, buscar override
if (enableSellUnitPricing && item.saleUnitId !== baseUnitId) {
  const sellUnitPrice = await prisma.sellUnitPrice.findFirst({
    where: {
      storeId,
      productMasterId,
      sellUnitId: item.saleUnitId,
      active: true,
    },
  });
  
  if (sellUnitPrice) {
    pricingMode = PricingMode.SELL_UNIT_OVERRIDE;
    sellUnitPriceApplied = Number(sellUnitPrice.price);
    // Subtotal = cantidad en sellUnit × precio pack
    subtotalItem = quantityOriginal * sellUnitPriceApplied;
  } else {
    // Normal: quantityBase × unitPrice
    subtotalItem = quantityBase * item.unitPrice;
  }
}
```

### 5. UI Inventario

- **SellUnitPriceManager** (`components/inventory/SellUnitPriceManager.tsx`)
  - Lista unidades con conversión configurada
  - Muestra precio calculado vs precio especial
  - Permite definir/editar/eliminar precios pack
  - Badge de ahorro cuando precio < calculado

- **ProductSellUnitPricesModal** (`components/inventory/ProductSellUnitPricesModal.tsx`)
  - Modal wrapper para gestionar desde inventario
  - Botón con icono Tag verde en tabla de inventario

### 6. POS UI (CartPanel.tsx)

Badge verde en el carrito cuando un item tiene precio especial:
```
Precio CAJA: S/ 5.00
```

### 7. Ticket (receipt/[id]/page.tsx)

Muestra precio de presentación si aplica:
```
Precio CAJA: S/ 5.00
```

### 8. CSV Export (reports/export/items/route.ts)

Nuevas columnas:
- `Modo Precio`: "Precio Pack" o "Normal"
- `Precio Presentacion`: Precio especial si aplica

## ARCHIVOS MODIFICADOS/CREADOS

### Nuevos
- `src/app/api/units/sell-prices/route.ts`
- `src/app/api/units/sell-prices/[id]/route.ts`
- `src/components/inventory/SellUnitPriceManager.tsx`
- `src/components/inventory/ProductSellUnitPricesModal.tsx`

### Modificados
- `prisma/schema.prisma` (PricingMode, SellUnitPrice, SaleItem fields, flag)
- `src/app/api/sales/checkout/route.ts` (override logic)
- `src/app/admin/feature-flags/page.tsx` (new flag)
- `src/app/inventory/page.tsx` (modal + button)
- `src/app/pos/page.tsx` (CartItem type)
- `src/components/pos/CartPanel.tsx` (badge)
- `src/app/receipt/[id]/page.tsx` (display + types)
- `src/app/api/reports/export/items/route.ts` (CSV columns)

## CHECKLIST DE PRUEBAS

### Configuración Inicial
- [ ] ENABLE_CONVERSIONS habilitado
- [ ] ENABLE_SELLUNIT_PRICING habilitado
- [ ] Producto con conversión configurada (ej: CAJA = 12 UND)

### UI Inventario
- [ ] Ver producto con conversión → aparece botón Tag verde
- [ ] Abrir modal "Precios por Presentación"
- [ ] Muestra lista de unidades con conversión
- [ ] Precio calculado se muestra correctamente (factor × precio base)
- [ ] Agregar precio especial menor al calculado → badge "Ahorro: S/ X.XX"
- [ ] Editar precio especial existente
- [ ] Eliminar precio especial → vuelve a calculado

### POS / Checkout
- [ ] Agregar producto al carrito en unidad con precio especial
- [ ] Badge verde muestra "Precio CAJA: S/ 5.00"
- [ ] Subtotal muestra precio pack × cantidad (no calculado)
- [ ] Aplicar promoción adicional → descuento sobre precio pack
- [ ] Aplicar descuento manual → sobre precio pack
- [ ] Finalizar venta → total correcto

### Ticket
- [ ] Abrir ticket de venta con precio pack
- [ ] Muestra "Precio CAJA: S/ 5.00" en verde
- [ ] Subtotal coincide con precio pack × cantidad

### CSV Export
- [ ] Descargar CSV de items
- [ ] Columna "Modo Precio" = "Precio Pack"
- [ ] Columna "Precio Presentacion" = S/ 5.00

### Casos Edge
- [ ] Sin precio especial → usa precio calculado normal
- [ ] Precio especial desactivado → usa calculado
- [ ] Flag ENABLE_SELLUNIT_PRICING OFF → checkout usa calculado
- [ ] Intentar crear precio para baseUnit → error "No aplica"
- [ ] Intentar crear precio sin conversión → error "Sin conversión"

## EJEMPLO COMPLETO

```
Producto: Clavo 2"
Precio base: S/ 0.50 / unidad
Conversión: 1 CAJA = 12 unidades

SIN precio especial:
  2 CAJA × (12 × S/0.50) = S/ 12.00

CON precio especial CAJA = S/ 5.00:
  2 CAJA × S/5.00 = S/ 10.00
  Ahorro: S/ 2.00 (vs calculado)
  
  SI además hay promoción 10% categoría FERRETERÍA:
  S/ 10.00 - 10% = S/ 9.00 final
```

## NOTAS TÉCNICAS

1. **Priority Order:**
   - SellUnitPrice override es el PRIMER paso del cálculo
   - Aplica ANTES de todas las promociones y descuentos
   - Es el nuevo "subtotalItem" base para el pipeline

2. **Stock:**
   - El stock SIEMPRE se descuenta en unidad base
   - Si vendes 2 CAJA = 24 unidades base descontadas

3. **Auditoría:**
   - SaleItem guarda snapshot: pricingMode + sellUnitPriceApplied
   - Permite recrear exactamente cómo se calculó la venta

4. **Rollback:**
   - Eliminar SellUnitPrice → ventas futuras usan calculado
   - Ventas históricas mantienen snapshot inmutable
