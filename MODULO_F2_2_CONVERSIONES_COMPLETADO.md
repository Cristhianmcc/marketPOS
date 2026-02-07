# ✅ MÓDULO F2.2 — CONVERSIÓN DE UNIDADES (unidad base → unidad venta)

## Resumen

Sistema de conversión de unidades para ferretería que permite vender productos en unidades alternativas (CAJA, METRO, etc.) manteniendo el stock en unidad base.

**Fecha:** 2025-01-XX  
**Estado:** COMPLETADO

---

## Conceptos Clave

### Terminología
- **baseUnit** = unidad de stock (NIU, MTR, KGM, etc.)
- **sellUnit** = unidad de venta alternativa (CAJA, ROLLO, etc.)
- **factorToBase** = cuántas unidades base equivalen a 1 sellUnit

### Fórmula
```
baseQty = sellQty × factorToBase
```

### Ejemplo
```
Producto: CABLE UTP
- baseUnit: MTR (metro)
- sellUnit: ROLLO
- factorToBase: 100

Venta: 2 ROLLOS
→ baseQty = 2 × 100 = 200 MTR
→ El stock se reduce en 200 metros
```

---

## Feature Flags

| Flag | Descripción |
|------|-------------|
| `ENABLE_ADVANCED_UNITS` | Habilita UI de unidades (dropdown, selector) |
| `ENABLE_CONVERSIONS` | Habilita conversiones en backend. Sin este flag, enviar saleUnitId ≠ baseUnitId genera error 403 |

---

## Cambios en Schema

### Modelo UnitConversion (actualizado)
```prisma
model UnitConversion {
  id              String        @id @default(cuid())
  storeId         String        @map("store_id")         // ✅ F2.2: Por tienda
  productMasterId String        @map("product_master_id") // ✅ F2.2: Por producto
  fromUnitId      String        @map("from_unit_id")
  toUnitId        String        @map("to_unit_id")       // Siempre es baseUnitId
  factorToBase    Decimal       @map("factor_to_base") @db.Decimal(18, 6) // ✅ F2.2: Nuevo nombre
  roundingMode    RoundingMode  @default(NONE) @map("rounding_mode")      // ✅ F2.2: Modo redondeo
  active          Boolean       @default(true)
  
  @@unique([storeId, productMasterId, fromUnitId, toUnitId])
}

enum RoundingMode {
  NONE   // Sin redondeo (error si no es entero)
  ROUND  // Redondeo matemático
  CEIL   // Siempre hacia arriba
  FLOOR  // Siempre hacia abajo
}
```

---

## APIs Implementadas

### 1. GET /api/units/conversions
```typescript
// Query: productMasterId obligatorio
GET /api/units/conversions?productMasterId=xxx

// Response
{
  conversions: [
    {
      id: "...",
      fromUnit: { id, code, name, symbol },
      toUnit: { id, code, name, symbol },
      factorToBase: 12,
      roundingMode: "NONE"
    }
  ]
}
```

### 2. POST /api/units/conversions
```typescript
POST /api/units/conversions
{
  productMasterId: "xxx",
  fromUnitId: "unit-caja",
  factorToBase: 12,
  roundingMode: "NONE" // opcional
}
// toUnitId se deriva automáticamente de ProductMaster.baseUnitId
```

### 3. PATCH/DELETE /api/units/conversions/[id]
```typescript
PATCH /api/units/conversions/:id
{ factorToBase: 24, roundingMode: "ROUND" }

DELETE /api/units/conversions/:id
```

### 4. GET /api/pos/units
```typescript
// Para el selector de unidades en POS
GET /api/pos/units?productMasterId=xxx

// Response
{
  enabled: true,
  baseUnit: { id, code, name, symbol, allowDecimals, precision },
  availableUnits: [
    { id, code, name, symbol, factor: 12, allowsDecimals: false }
  ],
  allowsDecimals: false,
  precision: 0
}
```

---

## Checkout (ACID)

### Flujo
1. Si `saleUnitId === baseUnitId` → Sin conversión
2. Si `saleUnitId !== baseUnitId`:
   - Verificar flag `ENABLE_CONVERSIONS` → Si OFF, error 403 `CONVERSIONS_DISABLED`
   - Buscar conversión por `(storeId, productMasterId, fromUnitId=saleUnitId, toUnitId=baseUnitId)`
   - Si no existe → error 422 `NO_CONVERSION_AVAILABLE`
   - Aplicar fórmula: `baseQty = sellQty × factorToBase`
   - Aplicar roundingMode si está configurado
   - Validar que baseQty sea entero si baseUnit.allowDecimals = false

### SaleItem guardado
```typescript
{
  quantity: baseQty,           // Cantidad en unidad base
  unitCodeUsed: "CAJA",        // Código de unidad usada
  quantityOriginal: sellQty,   // Cantidad original
  quantityBase: baseQty,       // Cantidad convertida
  conversionFactorUsed: 12,    // Factor aplicado
  unitSunatCode: "BX"          // Código SUNAT de sellUnit
}
```

---

## UI Implementada

### 1. Inventory: UnitConversionsManager
- Ubicación: `src/components/inventory/UnitConversionsManager.tsx`
- Funciones:
  - Listar conversiones del producto
  - Agregar nueva conversión (dropdown de unidades)
  - Eliminar conversión
  - Selector de roundingMode

### 2. POS: CartPanel con UnitDropdown
- Ubicación: `src/components/pos/CartPanel.tsx`
- Funciones:
  - Dropdown de unidades por ítem (si hay conversiones)
  - Muestra equivalencia: "2 CAJA → 24 base"
  - Cache de unidades por producto

### 3. Receipt: Info de conversión
- Ubicación: `src/app/receipt/[id]/page.tsx`
- Muestra:
  - Cantidad en unidad de venta: "2 CAJA"
  - Equivalencia: "= 24 unid. base"

### 4. CSV Export: Columnas adicionales
- Ubicación: `src/app/api/reports/export/items/route.ts`
- Columnas nuevas:
  - `Unidad Usada`
  - `Cantidad Original`
  - `Cantidad Base`
  - `Factor Conversion`
  - `Codigo SUNAT`

---

## Archivos Modificados

### Nuevos
- `src/app/api/units/conversions/[id]/route.ts` - PATCH/DELETE
- `src/components/inventory/UnitConversionsManager.tsx`

### Actualizados
- `prisma/schema.prisma` - RoundingMode enum, UnitConversion model
- `src/app/api/units/conversions/route.ts` - Reescrito para F2.2
- `src/app/api/pos/units/route.ts` - Usa factorToBase
- `src/lib/units/normalizeToBaseUnit.ts` - Requiere storeId, productMasterId
- `src/lib/units/index.ts` - Exports actualizados
- `src/app/api/sales/checkout/route.ts` - Lógica de conversión F2.2
- `src/app/api/units/convert/route.ts` - Requiere productMasterId
- `src/app/api/units/products/[id]/conversions/route.ts` - Reescrito
- `src/components/pos/CartPanel.tsx` - UnitDropdown integrado
- `src/app/receipt/[id]/page.tsx` - Muestra conversión
- `src/app/api/reports/export/items/route.ts` - Columnas F2.2

---

## Checklist de Pruebas

### 1. Configuración
- [ ] Activar flag `ENABLE_ADVANCED_UNITS` en admin
- [ ] Activar flag `ENABLE_CONVERSIONS` en admin

### 2. Crear Conversión
- [ ] Ir a Inventario > Producto > Conversiones
- [ ] Agregar conversión (ej: CAJA = 12 NIU)
- [ ] Verificar que aparece en la lista
- [ ] Verificar factorToBase y roundingMode

### 3. POS - Venta con Conversión
- [ ] Agregar producto con conversión al carrito
- [ ] Verificar dropdown de unidades aparece
- [ ] Cambiar de NIU a CAJA
- [ ] Verificar equivalencia: "2 CAJA → 24 base"
- [ ] Completar venta

### 4. Ticket
- [ ] Abrir `/receipt/[id]`
- [ ] Verificar línea: "2 CAJA x S/ X.XX"
- [ ] Verificar nota: "= 24 unid. base"

### 5. CSV Export
- [ ] Descargar CSV de items
- [ ] Verificar columnas: Unidad Usada, Cantidad Original, etc.
- [ ] Valores correctos para items con/sin conversión

### 6. Sin Flag ENABLE_CONVERSIONS
- [ ] Desactivar flag
- [ ] Intentar venta con unidad alternativa
- [ ] Verificar error 403: CONVERSIONS_DISABLED

### 7. Producto sin conversión configurada
- [ ] Agregar producto al carrito
- [ ] Verificar que NO aparece dropdown de unidades
- [ ] Venta funciona normal

### 8. Edge Cases
- [ ] Venta de 0.5 CAJA (debe mostrar error si NIU no acepta decimales)
- [ ] Factor muy grande (1000+)
- [ ] Factor decimal (1.5)

---

## Notas Importantes

1. **Precio siempre por baseUnit**: El StoreProduct.price es SIEMPRE el precio por unidad base
2. **Conversiones por producto**: Cada (storeId, productMasterId) tiene sus propias conversiones
3. **No globales**: "1 CAJA" no es igual para todos los productos
4. **Stock en baseUnit**: El stock siempre se maneja en unidad base

---

## Próximos Pasos (Futuros)

- [ ] Conversiones inversas (ej: vender 50 cm de 1 metro)
- [ ] Conversiones en cadena (PAQUETE → CAJA → UNIDAD)
- [ ] Precios especiales por unidad de venta
- [ ] Reglas de cantidad mínima por unidad

---

**Build Status:** ✅ PASSING
