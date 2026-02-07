# ══════════════════════════════════════════════════════════════════════════════
# MÓDULO V2 — UNIDADES AVANZADAS + CONVERSIONES (FERRETERÍA READY)
# ══════════════════════════════════════════════════════════════════════════════

## 📋 Resumen

Sistema de unidades avanzadas y conversiones automáticas para negocios multi-rubro.
Permite vender productos por metro, kilogramo, caja, docena, etc. y convertir
automáticamente las cantidades a la unidad base del inventario.

**Aislado por Feature Flags:**
- `ENABLE_ADVANCED_UNITS`: Activa UI de unidades avanzadas
- `ENABLE_CONVERSIONS`: Activa conversiones automáticas en checkout

---

## ✅ Implementaciones Completadas

### 1. Schema Prisma

| Modelo/Campo | Descripción |
|--------------|-------------|
| `Unit` | Modelo de unidades (code, name, symbol, isBase) |
| `UnitConversion` | Conversiones entre unidades (globales o por producto) |
| `ProductMaster.baseUnitId` | Unidad base opcional del producto |
| `SaleItem.unitCodeUsed` | Snapshot de unidad usado en venta |
| `SaleItem.quantityOriginal` | Cantidad original (antes de conversión) |
| `SaleItem.quantityBase` | Cantidad convertida (después de conversión) |
| `SaleItem.conversionFactorUsed` | Factor aplicado |
| `FeatureFlagKey.ENABLE_CONVERSIONS` | Nuevo flag para conversiones |

### 2. Seed de Unidades Base
Archivo: `prisma/seed.ts` → función `seedBaseUnits()`

**Unidades creadas:**
| Código | Nombre | Símbolo | Es Base |
|--------|--------|---------|---------|
| UNIT | Unidad | und | ✅ |
| KG | Kilogramo | kg | ✅ |
| G | Gramo | g | ❌ |
| M | Metro | m | ✅ |
| CM | Centímetro | cm | ❌ |
| MM | Milímetro | mm | ❌ |
| L | Litro | L | ✅ |
| ML | Mililitro | ml | ❌ |
| BOX | Caja | caja | ❌ |
| PACK | Paquete | paq | ❌ |
| ROLL | Rollo | rollo | ❌ |
| DOZEN | Docena | doc | ❌ |
| M2 | Metro cuadrado | m² | ✅ |

**Conversiones estándar:**
| De | A | Factor |
|----|---|--------|
| G | KG | 0.001 |
| CM | M | 0.01 |
| MM | M | 0.001 |
| ML | L | 0.001 |
| DOZEN | UNIT | 12 |

### 3. Helpers de Conversión
Archivos: `src/lib/units/`

| Función | Descripción |
|---------|-------------|
| `normalizeToBaseUnit()` | Convierte cantidad a unidad base |
| `getConversionFactor()` | Obtiene factor entre dos unidades |
| `createProductConversion()` | Crea conversión específica de producto |
| `validateQuantityForUnit()` | Valida cantidad (entero vs decimal) |
| `validateQuantityForProduct()` | Valida cantidad para un producto |
| `hasEnoughStock()` | Verifica stock disponible |

### 4. Endpoints API
Protegidos por guards `requireFlag`:

| Endpoint | Método | Flag Requerido |
|----------|--------|----------------|
| `/api/units` | GET | ENABLE_ADVANCED_UNITS |
| `/api/units` | POST | ENABLE_ADVANCED_UNITS |
| `/api/units/conversions` | GET | ENABLE_ADVANCED_UNITS + ENABLE_CONVERSIONS |
| `/api/units/conversions` | POST | ENABLE_ADVANCED_UNITS + ENABLE_CONVERSIONS |
| `/api/units/convert` | POST | ENABLE_CONVERSIONS |

### 5. Integración en Checkout
Archivo: `src/app/api/sales/checkout/route.ts`

**Cambios:**
- Nueva interfaz `CheckoutItem.saleUnitId` (opcional)
- Verificación de flag `ENABLE_CONVERSIONS`
- Conversión automática usando `normalizeToBaseUnit()`
- Snapshot de conversión guardado en `SaleItem`
- Stock actualizado usando `quantityBase`
- Movements registrados usando `quantityBase`

### 6. UI Feature Flags
Archivo: `src/app/admin/feature-flags/page.tsx`

Agregada descripción de `ENABLE_CONVERSIONS`:
> "Convierte automáticamente entre unidades (ej: 1 caja = 12 unidades). Requiere Unidades Avanzadas."

### 7. Business Profile Preset
Archivo: `src/lib/businessProfiles.ts`

`FERRETERIA` ahora incluye:
- `ENABLE_ADVANCED_UNITS`
- `ENABLE_CONVERSIONS` ✅ (nuevo)

---

## 🧪 Checklist de Testing

### A. Seed de Unidades
- [ ] Ejecutar `npx prisma db seed`
- [ ] Verificar que se crean 13 unidades base
- [ ] Verificar que se crean 5 conversiones estándar

### B. Endpoints con Flag OFF
- [ ] GET `/api/units` → 403 FEATURE_DISABLED
- [ ] POST `/api/units` → 403 FEATURE_DISABLED
- [ ] GET `/api/units/conversions` → 403 FEATURE_DISABLED
- [ ] POST `/api/units/convert` → 403 FEATURE_DISABLED

### C. Endpoints con Flag ON
1. Habilitar `ENABLE_ADVANCED_UNITS` para la tienda
2. - [ ] GET `/api/units` → Lista de unidades
3. - [ ] POST `/api/units` con código nuevo → 201 Created
4. - [ ] POST `/api/units` con código existente → 409 Conflict

5. Habilitar también `ENABLE_CONVERSIONS`
6. - [ ] GET `/api/units/conversions` → Lista de conversiones
7. - [ ] POST `/api/units/conversions` → 201 Created
8. - [ ] POST `/api/units/convert` con cantidad válida → Conversión calculada

### D. Checkout con Conversiones
1. Configurar producto con `baseUnitId = KG`
2. Habilitar `ENABLE_CONVERSIONS`
3. - [ ] Enviar checkout con `saleUnitId = G`, `quantity = 500`
4. - [ ] Verificar `quantityBase = 0.5` (500g = 0.5kg)
5. - [ ] Verificar stock decrementado en 0.5 (no 500)
6. - [ ] Verificar SaleItem con snapshot de conversión

### E. Checkout sin Conversiones (Bodega)
1. No habilitar flags de conversiones
2. - [ ] Checkout normal funciona sin cambios
3. - [ ] `saleUnitId` ignorado si se envía
4. - [ ] Inventario usa `quantity` directamente

### F. Business Profile Ferretería
1. - [ ] Cambiar tienda a perfil FERRETERIA
2. - [ ] Verificar que `ENABLE_ADVANCED_UNITS` y `ENABLE_CONVERSIONS` se activan
3. - [ ] Endpoints de unidades accesibles

---

## 📁 Archivos Modificados/Creados

```
prisma/schema.prisma           # Unit, UnitConversion, SaleItem fields
prisma/seed.ts                 # seedBaseUnits()

src/lib/units/
├── index.ts                   # Exportaciones
├── normalizeToBaseUnit.ts     # Conversión principal
└── validateQuantity.ts        # Validaciones

src/lib/businessProfiles.ts    # ENABLE_CONVERSIONS en FERRETERIA

src/app/api/units/
├── route.ts                   # GET/POST unidades
├── conversions/route.ts       # GET/POST conversiones
└── convert/route.ts           # POST calcular conversión

src/app/api/sales/checkout/route.ts  # Integración de conversiones
src/app/admin/feature-flags/page.tsx # UI descripción ENABLE_CONVERSIONS
```

---

## 🔄 Próximos Pasos (Futuros Módulos)

1. **UI de Gestión de Unidades** - CRUD en admin
2. **Selector de Unidad en POS** - Para productos con conversiones
3. **Configuración por Producto** - Asignar baseUnitId desde catálogo
4. **Precios por Unidad** - Diferentes precios por unidad de venta
5. **Reportes por Unidad** - Ventas en kg, m, etc.

---

## ✅ Estado: COMPLETADO

Build exitoso. Módulo listo para testing y UI futura.
