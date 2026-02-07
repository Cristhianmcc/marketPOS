# MÓDULO F5 — Catálogo Base Ferretería + Import CSV Robusto

**Estado:** ✅ COMPLETADO  
**Fecha:** Enero 2025

---

## 🎯 Objetivo

Acelerar la adopción del sistema con:
- Importación masiva de productos desde CSV
- Soporte para conversiones de unidades por producto
- Plantillas de ejemplo por tipo de negocio (ferretería, bodega)
- Unidades de medida específicas para ferretería

---

## 📦 Cambios Implementados

### 1. Unidades de Medida Extendidas (prisma/seed.ts)

Se agregaron unidades específicas para ferretería:

| Código | Nombre | Permite Decimales | Precisión |
|--------|--------|-------------------|-----------|
| PIE | Pie | ✅ | 2 |
| PULG | Pulgada | ✅ | 2 |
| GAL | Galón | ✅ | 3 |
| SET | Juego | ❌ | 0 |
| BAG | Bolsa | ❌ | 0 |
| SACK | Saco | ❌ | 0 |
| SHEET | Plancha | ❌ | 0 |
| PIE2 | Pie² | ✅ | 2 |

### 2. Conversiones Estándar Adicionales

```
PIE → M (0.3048)
PULG → M (0.0254)
GAL → L (3.785)
PIE2 → M2 (0.0929)
M → CM (100)
```

### 3. API de Importación Robusta

**Endpoint:** `/api/products/import-csv`

#### Modo Preview (FormData)
```typescript
POST /api/products/import-csv
Content-Type: multipart/form-data

// Respuesta:
{
  preview: ParsedProduct[],
  summary: {
    totalRows: number,
    validRows: number,
    errorRows: number,
    previewRows: number,
    hasMore: boolean
  },
  availableUnits: { code: string, symbol: string }[]
}
```

#### Modo Confirm (JSON)
```typescript
POST /api/products/import-csv
Content-Type: application/json

{
  products: ParsedProduct[],
  updateExisting: boolean
}

// Respuesta:
{
  success: true,
  result: {
    created: number,
    updated: number,
    skipped: number
  }
}
```

### 4. Formato CSV Soportado

```csv
name,category,barcode,brand,content,baseUnitCode,price,stock,minStock,conversions
Tornillo 2",Tornillería,7501234567890,Stanley,,UNIT,0.10,5000,100,"BOX:100,PACK:25"
Cable THW 12AWG,Electricidad,,,100m,M,2.50,500,50,"ROLL:100"
```

**Campos:**
- `name` (requerido): Nombre del producto
- `category` (default: "Sin Categoría"): Categoría
- `barcode`: Código de barras (opcional)
- `brand`: Marca (opcional)
- `content`: Contenido/presentación (opcional)
- `baseUnitCode`: Código de unidad base (UNIT, KG, M, L, etc.)
- `price` (requerido): Precio de venta
- `stock` (default: 0): Stock inicial
- `minStock`: Stock mínimo para alertas
- `conversions`: Formato "CODE:factor,CODE:factor" 
  - Ejemplo: "BOX:12" = 1 BOX = 12 unidades base

### 5. Plantillas CSV

Se crearon 3 plantillas en `/public/templates/`:

| Archivo | Productos | Descripción |
|---------|-----------|-------------|
| `plantilla-ferreteria.csv` | ~100 | Tornillos, cables, tubos, pinturas, herramientas |
| `plantilla-bodega.csv` | ~90 | Bebidas, abarrotes, lácteos, limpieza |
| `plantilla-vacia.csv` | 0 | Solo cabeceras para llenar manualmente |

Ejemplos de productos con conversiones:
- Cerveza → `PACK:6,BOX:24` (vender por unidad, pack de 6, caja de 24)
- Cable 100m → `ROLL:100` (1 rollo = 100 metros)
- Tornillos → `BOX:100,PACK:25` (caja de 100, pack de 25)

### 6. Categorías de Ferretería (lib/hardware-categories.ts)

```typescript
export const FERRETERIA_CATEGORIES = {
  "Construcción": [
    "Cemento y Morteros",
    "Fierro y Varillas",
    "Ladrillos y Bloques",
    ...
  ],
  "Plomería": ["Tubos PVC", "Conexiones", ...],
  "Electricidad": ["Cables", "Tomacorrientes", ...],
  // ~60 categorías organizadas por grupo
}
```

### 7. UI de Importación (/inventory/import)

Características:
- Descarga de plantillas por tipo de negocio
- Vista previa con validación de errores
- Muestra conversiones por producto
- Opción "Actualizar existentes"
- Contador de productos válidos/con error
- Tooltips con detalle de errores

---

## 📁 Archivos Creados/Modificados

```
prisma/
  └── seed.ts                    # Unidades y conversiones extendidas

src/
  ├── lib/
  │   └── hardware-categories.ts # Categorías por rubro (nuevo)
  ├── app/
  │   ├── api/products/import-csv/
  │   │   └── route.ts          # API robusta (nuevo)
  │   └── inventory/import/
  │       └── page.tsx          # UI renovada

public/templates/
  ├── plantilla-ferreteria.csv  # ~100 productos
  ├── plantilla-bodega.csv      # ~90 productos
  └── plantilla-vacia.csv       # Solo cabeceras
```

---

## 🧪 Checklist de Pruebas

### Importación CSV
- [ ] Descargar plantilla ferretería
- [ ] Editar plantilla en Excel/Sheets
- [ ] Subir CSV al sistema
- [ ] Verificar preview muestra conversiones
- [ ] Confirmar importación
- [ ] Verificar productos en inventario

### Conversiones
- [ ] Producto con conversiones aparece en inventario
- [ ] En POS se puede seleccionar unidad de venta
- [ ] Stock se descuenta correctamente según conversión

### Casos de Error
- [ ] CSV con columnas faltantes → muestra error
- [ ] Precio inválido → marca fila con error
- [ ] Unidad inexistente → sugerencia de unidades disponibles
- [ ] Código repetido → opción de actualizar o saltar

---

## 🚀 Ejemplo de Uso

### 1. Ferretería Nueva

```bash
# 1. Descargar plantilla
GET /templates/plantilla-ferreteria.csv

# 2. Editar en Excel (cambiar precios, agregar productos)

# 3. Subir al sistema
POST /api/products/import-csv (FormData)

# 4. Revisar preview, ajustar errores

# 5. Confirmar importación
POST /api/products/import-csv (JSON)
```

### 2. Agregar Conversiones a Producto Existente

En el CSV, incluir el barcode del producto existente:
```csv
name,category,barcode,baseUnitCode,price,stock,conversions
Cerveza Pilsen,Bebidas,7751234000001,UNIT,5.00,0,"PACK:6,BOX:24"
```

Con `updateExisting: true`, se agregarán las conversiones al producto.

---

## 📊 Impacto en Adopción

| Antes | Después |
|-------|---------|
| Agregar productos 1 a 1 | Importar 100+ productos en segundos |
| Sin soporte para conversiones | "BOX:12,PACK:6" en CSV |
| Sin plantillas de ejemplo | 3 plantillas por rubro |
| Unidades limitadas | 25+ unidades para ferretería |

---

## 🔒 Seguridad

- API protegida por autenticación
- Validación de tipos en servidor
- Límite de preview (50 filas) para no saturar memoria
- Transacciones Prisma para importación atómica

---

## ✅ Estado Final

- **Build:** ✅ Sin errores
- **Linting:** ✅ Sin warnings
- **Tipos:** ✅ TypeScript validado
- **Plantillas:** ✅ Descargables

---

**Siguiente módulo sugerido:** F6 — Dashboard de estadísticas por categoría/proveedor
