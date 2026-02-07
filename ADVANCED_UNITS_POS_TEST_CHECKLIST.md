# MÓDULO F1 — POS FERRETERÍA: UNIDADES + CONVERSIONES — TEST CHECKLIST

## Resumen de Implementación

**Objetivo:** POS soporta venta por metro/cm/mm/m²/litro/caja con UX rápida.

**Archivos Creados/Modificados:**
- `src/app/api/pos/units/route.ts` — API endpoint para unidades de producto
- `src/components/pos/AdvancedUnitSelector.tsx` — Componente selector de unidades
- `src/app/pos/page.tsx` — Integración de unidades avanzadas en POS
- `src/components/pos/CartPanel.tsx` — Display de conversiones en carrito
- `src/components/pos/MobileCartDrawer.tsx` — Display de conversiones en mobile

---

## Pre-requisitos

- [ ] Flag `ENABLE_ADVANCED_UNITS` **ON** para la tienda de prueba
- [ ] Flag `ENABLE_CONVERSIONS` **ON** para la tienda de prueba
- [ ] Tienda con perfil FERRETERIA configurado
- [ ] Productos de prueba con diferentes unidades base (M, UNIT, KG, BOX)
- [ ] Conversiones creadas en la base de datos (ej: CM→M con factor 0.01)

---

## Pruebas Funcionales

### 1. API de Unidades (/api/pos/units)

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| 1.1 | GET sin productMasterId | Error 400 "productMasterId es requerido" | |
| 1.2 | GET con productMasterId válido (flag ON) | JSON con baseUnit y availableUnits | |
| 1.3 | GET con productMasterId cuando flag OFF | `{ enabled: false, baseUnit: null }` | |
| 1.4 | GET producto sin conversiones | availableUnits = [] (array vacío) | |
| 1.5 | GET producto con conversiones | Lista de unidades con factor | |

### 2. Display de Unidad Base

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| 2.1 | Producto base M → agregar al carrito | Se muestra cantidad "1 M" | |
| 2.2 | Producto base UNIT → agregar al carrito | Se muestra cantidad "1" (sin código) | |
| 2.3 | Flag OFF → agregar al carrito | UX normal sin código de unidad | |

### 3. Selector de Unidades (AdvancedUnitSelector)

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| 3.1 | Producto con conversiones | Dropdown muestra alternativas | |
| 3.2 | Cambiar de M a CM | Input permite decimales, muestra equivalencia | |
| 3.3 | Ingresar "150 CM" | Muestra "= 1.50 M" en equivalencia | |
| 3.4 | Producto base UNIT, ingresar "1.5" | Error "Solo cantidades enteras permitidas" | |
| 3.5 | Producto base KG, ingresar "0.5" | Acepta decimal sin error | |

### 4. Validación de Decimales

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| 4.1 | Unidad M → ingresar 1.25 | ✅ Acepta | |
| 4.2 | Unidad CM → ingresar 50 | ✅ Acepta | |
| 4.3 | Unidad UNIT → ingresar 1.5 | ❌ Rechaza, icono error | |
| 4.4 | Unidad BOX → ingresar 2.5 | ❌ Rechaza (BOX es entero) | |
| 4.5 | Unidad KG → ingresar 0.750 | ✅ Acepta | |

### 5. Conversión en Carrito

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| 5.1 | Item con conversión aplicada | Muestra flecha "→ X [base]" | |
| 5.2 | 100 CM de producto M | Carrito muestra "→ 1 M" | |
| 5.3 | 1 BOX (factor 12) de productos | Carrito muestra "→ 12 UNIT" | |
| 5.4 | Flag OFF | No muestra conversiones | |

### 6. Checkout con Unidades

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| 6.1 | Checkout con item convertido | API recibe quantityBase correcto | |
| 6.2 | Checkout incluye saleUnitId | Payload contiene unitIdUsed | |
| 6.3 | Stock se decrementa en base | 100 CM vendidos = -1 del stock M | |

### 7. Mobile Experience

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| 7.1 | MobileCartDrawer muestra unidad | Cantidad con código de unidad visible | |
| 7.2 | Conversión visible en mobile | Chip azul con "→ X base" | |

### 8. Flag OFF (Bodega tradicional)

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| 8.1 | Flag OFF → POS sin cambios | UX exactamente igual que antes | |
| 8.2 | Flag OFF → no hay selector unidades | Sin dropdown ni AdvancedUnitSelector | |
| 8.3 | Flag OFF → checkout normal | No envía saleUnitId | |

---

## Pruebas de Edge Cases

| # | Prueba | Resultado Esperado | ✓ |
|---|--------|-------------------|---|
| E1 | Producto sin unidad base definida | Usa unitType como fallback | |
| E2 | Conversión circular (A→B, B→A) | Solo muestra una opción por unidad | |
| E3 | Factor de conversión muy pequeño (0.001) | Cálculo preciso sin overflow | |
| E4 | Factor de conversión muy grande (1000) | Cálculo preciso sin overflow | |
| E5 | Cantidad 0 | No permite agregar/mantener | |
| E6 | Cantidad negativa | Rechaza input | |

---

## Notas de Testing

1. **Unidades Decimales:** M, KG, L, M2
2. **Unidades Enteras:** UNIT, BOX, PAIR, BAG, PACK
3. **Verificar consola** para errores de fetch
4. **Verificar Network tab** para payloads de checkout

---

## Fecha de Última Actualización
$(Get-Date -Format "yyyy-MM-dd")

## Estado
🟡 PENDIENTE TESTING
