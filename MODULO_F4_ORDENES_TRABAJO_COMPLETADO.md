# MÓDULO F4 — Órdenes de Trabajo (OT) / Cotizaciones Ferretería

## Resumen

Este módulo permite crear, gestionar y convertir órdenes de trabajo (OT) a ventas. Las OT son cotizaciones o pedidos especiales que pueden incluir productos y servicios.

**Casos de uso típicos:**
- Corte de melamina
- Instalación de servicios
- Pedido de puerta a medida
- Pedido de vidrio a medida
- Trabajos personalizados con medidas específicas

## Características Principales

### 1. Modelos de Datos

**WorkOrder (Orden de Trabajo)**
- `id`: UUID
- `storeId`: Tienda asociada
- `number`: Número correlativo por tienda
- `customerId`: Cliente (opcional)
- `status`: Estado del workflow
- `notes`: Notas generales
- `subtotal`, `discount`, `total`: Montos
- `saleId`: Referencia a venta cuando se convierte

**WorkOrderItem (Items de la Orden)**
- `type`: PRODUCT | SERVICE
- `storeProductId` / `serviceId`: Referencia al producto o servicio
- `itemName`, `itemContent`: Snapshot del nombre/contenido
- `unitIdUsed`: Unidad usada (para productos por metro, etc.)
- `quantityOriginal`, `quantityBase`, `conversionFactor`: Cantidades
- `unitPrice`, `subtotal`: Precios
- `notes`: Notas específicas (medidas, especificaciones)

### 2. Estados del Workflow

| Estado | Descripción |
|--------|-------------|
| `DRAFT` | Borrador, editable |
| `APPROVED` | Aprobado, listo para trabajar |
| `IN_PROGRESS` | Trabajo en proceso |
| `READY` | Listo para entregar |
| `CLOSED` | Cerrado (convertido a venta) |
| `CANCELLED` | Cancelado |

### 3. Regla de Inventario

⚠️ **IMPORTANTE**: Las órdenes de trabajo **NO afectan el inventario** hasta que se convierten a venta.

- Los productos se reservan "conceptualmente" pero no se descuentan
- Al convertir a venta, se valida stock disponible
- Si no hay stock suficiente, la conversión falla
- Los servicios no afectan inventario nunca

### 4. API Endpoints

#### `GET /api/work-orders`
Lista órdenes con filtros:
- `status`: Filtrar por estado
- `customerId`: Filtrar por cliente
- `q`: Búsqueda por número/nombre
- `page`, `limit`: Paginación

#### `POST /api/work-orders`
Crear nueva orden:
```json
{
  "customerId": "uuid-opcional",
  "notes": "Notas generales",
  "items": [
    {
      "type": "PRODUCT",
      "storeProductId": "uuid",
      "unitIdUsed": "uuid-opcional",
      "quantityOriginal": 2.5,
      "conversionFactor": 1,
      "unitPrice": 15.50,
      "notes": "Corte 60x40cm"
    },
    {
      "type": "SERVICE",
      "serviceId": "uuid",
      "quantityOriginal": 1,
      "conversionFactor": 1,
      "unitPrice": 25.00,
      "notes": "Instalación incluida"
    }
  ]
}
```

#### `PATCH /api/work-orders`
Actualizar orden (solo DRAFT puede modificar items):
```json
{
  "id": "uuid",
  "status": "APPROVED",
  "customerId": "uuid",
  "notes": "Notas actualizadas"
}
```

#### `DELETE /api/work-orders`
Cancelar o eliminar orden:
- DRAFT sin ventas: elimina permanentemente
- Otros estados: marca como CANCELLED

#### `GET /api/work-orders/[id]`
Obtener detalle de una orden.

#### `POST /api/work-orders/[id]/convert-to-sale`
Convertir orden aprobada a venta:
```json
{
  "paymentMethod": "CASH",
  "amountPaid": 150.00,
  "customerId": "uuid-opcional"
}
```

**Validaciones:**
- Solo estados APPROVED, IN_PROGRESS, READY pueden convertirse
- Requiere turno abierto (excepto FIADO)
- Valida stock disponible para productos
- Cliente requerido para FIADO

**Proceso de conversión:**
1. Crea Sale con SaleItems
2. Descuenta stock solo para productos (no servicios)
3. Crea movimientos de inventario
4. Si FIADO, crea Receivable
5. Marca OT como CLOSED con referencia a la venta

### 5. UI - Páginas

#### `/work-orders`
- Lista de órdenes con filtros por estado
- Estadísticas por estado
- Acciones rápidas: aprobar, iniciar, marcar listo
- Botón "Convertir a Venta"

#### `/work-orders/new`
- Formulario de nueva orden
- Selector de cliente (opcional)
- Agregador de productos con unidades
- Agregador de servicios
- Campo de notas por item (medidas, especificaciones)
- Resumen con totales

#### `/work-orders/[id]`
- Detalle completo de la orden
- Timeline de estados
- Botones de acción según estado
- Modal de conversión a venta

### 6. Feature Flag

El módulo está controlado por el flag:
```
ENABLE_WORK_ORDERS
```

Si está deshabilitado, la página muestra mensaje de "módulo no habilitado".

## Checklist de Pruebas

### Crear OT
- [ ] Crear OT con 2 productos por metro + 1 servicio
- [ ] Verificar que el inventario NO cambia
- [ ] Agregar notas con medidas específicas
- [ ] Guardar como borrador

### Workflow de Estados
- [ ] Aprobar orden (DRAFT → APPROVED)
- [ ] Iniciar trabajo (APPROVED → IN_PROGRESS)
- [ ] Marcar como listo (IN_PROGRESS → READY)
- [ ] Cancelar orden (cualquier estado → CANCELLED)

### Convertir a Venta
- [ ] Convertir OT aprobada a venta con CASH
- [ ] Verificar que:
  - [ ] Sale se crea correctamente
  - [ ] Stock descuenta solo productos (no servicios)
  - [ ] Movimientos de inventario creados
  - [ ] OT queda en estado CLOSED
  - [ ] OT tiene referencia a la venta

### Convertir con FIADO
- [ ] Intentar convertir sin cliente → error
- [ ] Convertir con cliente → Receivable creada

### Edge Cases
- [ ] Intentar convertir sin stock suficiente → error
- [ ] Intentar convertir sin turno abierto → error
- [ ] Intentar editar OT cerrada → no permitido

### Reportes
- [ ] Ventas creadas desde OT aparecen en reportes normales
- [ ] Historial de ventas muestra el origen

## Archivos Modificados/Creados

### Schema
- `prisma/schema.prisma`: WorkOrder, WorkOrderItem, enums

### API
- `src/app/api/work-orders/route.ts`: CRUD principal
- `src/app/api/work-orders/[id]/route.ts`: Detalle
- `src/app/api/work-orders/[id]/convert-to-sale/route.ts`: Conversión

### UI
- `src/app/work-orders/page.tsx`: Lista
- `src/app/work-orders/new/page.tsx`: Crear
- `src/app/work-orders/[id]/page.tsx`: Detalle

## Dependencias

- **F3 (Servicios)**: Para items tipo SERVICE
- **Módulo de Ventas**: Para conversión a Sale
- **Módulo de Inventario**: Para validación y descuento de stock
- **Módulo de Turnos**: Para validación de turno abierto
- **Módulo de Clientes**: Para asignación y FIADO

---

**Fecha de completado**: Febrero 2026  
**Versión**: 1.0.0
