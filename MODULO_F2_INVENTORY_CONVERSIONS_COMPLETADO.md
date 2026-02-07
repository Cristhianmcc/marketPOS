# MÓDULO F2 — Inventario Ferretería: Configurar baseUnit + Conversiones

## Resumen

Este módulo permite a los owners de tiendas FERRETERÍA configurar:
1. **Unidad base** de cada producto (ej: UNIT, M, KG)
2. **Conversiones** específicas por producto (ej: 1 BOX = 12 UNIT)

## Archivos Creados/Modificados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `src/app/api/units/products/[id]/conversions/route.ts` | Nuevo | API CRUD para conversiones de producto |
| `src/app/api/units/products/[id]/base-unit/route.ts` | Nuevo | API para gestionar unidad base |
| `src/components/inventory/ProductConversionsModal.tsx` | Nuevo | Modal UI para configurar conversiones |
| `src/app/inventory/page.tsx` | Modificado | Botón Scale + modal integrado |

## Endpoints API

### GET `/api/units/products/[id]/conversions`
Lista conversiones del producto.

**Respuesta:**
```json
{
  "productId": "...",
  "productName": "Tubo PVC 1/2",
  "baseUnit": { "id": "...", "code": "M", "name": "Metro" },
  "conversions": [
    {
      "id": "...",
      "fromUnit": { "code": "BOX" },
      "toUnit": { "code": "M" },
      "factor": 12,
      "active": true
    }
  ]
}
```

### POST `/api/units/products/[id]/conversions`
Crea conversión específica del producto.

**Body:**
```json
{
  "fromUnitId": "uuid-de-BOX",
  "factor": 12
}
```
- `toUnitId` se infiere del `baseUnit` del producto.

### PATCH `/api/units/products/[id]/conversions`
Activa/desactiva conversión.

**Body:**
```json
{
  "conversionId": "uuid",
  "active": false
}
```

### DELETE `/api/units/products/[id]/conversions?conversionId=uuid`
Elimina conversión.

### GET `/api/units/products/[id]/base-unit`
Obtiene la unidad base del producto.

### PUT `/api/units/products/[id]/base-unit`
Actualiza la unidad base.

**Body:**
```json
{
  "baseUnitId": "uuid-de-M"
}
```

## Validaciones

1. **factor > 0**: El factor de conversión debe ser positivo
2. **fromUnit != toUnit**: La unidad origen debe ser diferente a la base
3. **Sin duplicados activos**: No puede haber dos conversiones activas desde la misma unidad
4. **Permisos**: Solo OWNER puede crear/editar
5. **Flags requeridos**: ENABLE_ADVANCED_UNITS + ENABLE_CONVERSIONS

## UI - Modal de Conversiones

El modal se abre desde `/inventory` haciendo clic en el ícono Scale (balanza) azul que aparece cuando:
- El usuario es OWNER
- Los flags `ENABLE_ADVANCED_UNITS` y `ENABLE_CONVERSIONS` están activos

### Funcionalidades

1. **Selector de Unidad Base**: Dropdown para elegir la unidad en la que se mide el stock
2. **Lista de Conversiones**: Muestra "1 BOX = 12 UNIT" con toggle activo/inactivo
3. **Agregar Conversión**: Form inline con:
   - Dropdown "De unidad"
   - Input numérico "Factor"
   - Label readonly "A unidad" (la base)
4. **Preview**: Muestra ejemplo visual antes de guardar

---

## Checklist de Testing

### Pre-requisitos
- [ ] Tienda con perfil FERRETERIA activado
- [ ] Flags `ENABLE_ADVANCED_UNITS` y `ENABLE_CONVERSIONS` habilitados
- [ ] Al menos un producto creado

### Test 1: Crear producto base UNIT → agregar BOX=12
1. [ ] Ir a `/inventory`
2. [ ] Verificar que aparece botón Scale (azul) en acciones
3. [ ] Click en Scale → abre modal "Unidades y Conversiones"
4. [ ] Verificar que muestra unidad base actual (UNIT o KG)
5. [ ] En "Agregar Conversión":
   - Seleccionar "BOX" en dropdown
   - Escribir "12" en factor
   - Ver preview: "1 BOX = 12 UNIT"
6. [ ] Click "+" para agregar
7. [ ] Verificar que aparece en lista de conversiones

### Test 2: POS muestra selector BOX y calcula equivalencia
1. [ ] Ir a `/pos`
2. [ ] Agregar el producto con conversión al carrito
3. [ ] Verificar que el selector de unidades muestra BOX como opción
4. [ ] Seleccionar BOX → la cantidad se muestra en BOX
5. [ ] Verificar que muestra "→ X UNIT" como equivalencia base

### Test 3: Desactivar conversión → desaparece del POS
1. [ ] Volver a `/inventory`
2. [ ] Abrir modal de conversiones del producto
3. [ ] Click en toggle para desactivar la conversión BOX
4. [ ] Ir a `/pos`
5. [ ] Verificar que BOX ya NO aparece en el selector de unidades

### Test 4: Cambiar unidad base
1. [ ] En modal de conversiones, cambiar unidad base a "M" (Metro)
2. [ ] Verificar que las conversiones existentes se recalculan
3. [ ] Agregar nueva conversión: "1 CM = 0.01 M"

### Test 5: Validaciones
1. [ ] Intentar crear conversión con factor 0 → Error
2. [ ] Intentar crear conversión con factor negativo → Error
3. [ ] Intentar crear conversión duplicada → Error "Ya existe conversión activa"
4. [ ] Intentar seleccionar misma unidad como origen y destino → No aparece en dropdown

### Test 6: Permisos
1. [ ] Login como CASHIER → No aparece botón Scale
2. [ ] Login como OWNER → Aparece botón Scale

### Test 7: Flags deshabilitados
1. [ ] Deshabilitar flag ENABLE_CONVERSIONS
2. [ ] Verificar que botón Scale desaparece
3. [ ] API retorna 403 si se intenta acceder directamente

---

## Notas de Implementación

- Las conversiones específicas del producto tienen prioridad sobre las globales
- El `baseUnitId` se usa para nuevas tiendas; `unitType` (UNIT/KG) mantiene compatibilidad
- El factor siempre va de la unidad alternativa hacia la base (ej: BOX → UNIT, no UNIT → BOX)
