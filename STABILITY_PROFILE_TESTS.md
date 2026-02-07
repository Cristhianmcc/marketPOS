# STABILITY PROFILE TESTS — MÓDULO V0

## Propósito
Este documento define los **perfiles de prueba por rubro** para garantizar que los módulos nuevos (ferretería, botica, hostal, etc.) **no afecten el funcionamiento de bodegas**.

Cada perfil representa una combinación específica de feature flags habilitados.

---

## 🎯 Perfiles de Prueba

### BODEGA_BASELINE (Perfil Base)
> Configuración mínima para una bodega tradicional.
> **Este perfil NUNCA debe fallar** — es la línea base de estabilidad.

**Feature Flags:**
| Flag | Estado |
|------|--------|
| ALLOW_FIADO | ✅ ON |
| ALLOW_COUPONS | ✅ ON |
| ENABLE_PROMOTIONS | ✅ ON |
| ENABLE_VOLUME_PROMOS | ✅ ON |
| ENABLE_NTH_PROMOS | ✅ ON |
| ENABLE_CATEGORY_PROMOS | ✅ ON |
| ENABLE_SUNAT | ⚪ OFF |
| ENABLE_ADVANCED_UNITS | ⚪ OFF |
| ENABLE_SERVICES | ⚪ OFF |
| ENABLE_WORK_ORDERS | ⚪ OFF |
| ENABLE_RESERVATIONS | ⚪ OFF |
| ENABLE_BATCH_EXPIRY | ⚪ OFF |

---

### FERRETERIA (Unidades Avanzadas)
> Venta de materiales por metro, kg fraccionado, conversiones.

**Feature Flags adicionales:**
| Flag | Estado |
|------|--------|
| ENABLE_ADVANCED_UNITS | ✅ ON |

---

### TALLER (Servicios + Órdenes de Trabajo)
> Reparaciones con mano de obra, seguimiento de órdenes.

**Feature Flags adicionales:**
| Flag | Estado |
|------|--------|
| ENABLE_SERVICES | ✅ ON |
| ENABLE_WORK_ORDERS | ✅ ON |

---

### LAVANDERIA (Solo Servicios)
> Servicios sin órdenes complejas.

**Feature Flags adicionales:**
| Flag | Estado |
|------|--------|
| ENABLE_SERVICES | ✅ ON |

---

### HOSTAL (Reservaciones)
> Check-in, check-out, disponibilidad de habitaciones.

**Feature Flags adicionales:**
| Flag | Estado |
|------|--------|
| ENABLE_RESERVATIONS | ✅ ON |

---

### BOTICA (Lotes y Vencimientos)
> Trazabilidad de lotes, alertas de vencimiento, FIFO.

**Feature Flags adicionales:**
| Flag | Estado |
|------|--------|
| ENABLE_BATCH_EXPIRY | ✅ ON |

---

## ✅ Matriz de Pruebas por Perfil

Cada celda indica si la prueba aplica (✅) o no aplica (—) para ese perfil.

| Prueba | BODEGA | FERRETERIA | TALLER | LAVANDERIA | HOSTAL | BOTICA |
|--------|--------|------------|--------|------------|--------|--------|
| **CHECKOUT** |
| Venta CASH | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Venta YAPE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Venta CARD | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Venta con descuento | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Venta fiado | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Venta con cupón | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Venta con promoción | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **TURNOS** |
| Abrir turno | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cerrar turno | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cuadre de caja | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **INVENTARIO** |
| Crear producto | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editar producto | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Eliminar producto | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Movimiento entrada | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Movimiento salida | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **REPORTES** |
| CSV ventas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CSV inventario | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ticket | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **MÓDULOS ESPECÍFICOS** |
| Unidades avanzadas | — | ✅ | — | — | — | — |
| Servicios CRUD | — | — | ✅ | ✅ | — | — |
| Órdenes de trabajo | — | — | ✅ | — | — | — |
| Reservaciones | — | — | — | — | ✅ | — |
| Lotes/vencimientos | — | — | — | — | — | ✅ |

---

## 🔒 Reglas de Aislamiento

### 1. Si flag OFF → Endpoint retorna 403
```bash
# Ejemplo: tienda sin ENABLE_ADVANCED_UNITS
curl -X GET /api/units
# Respuesta: { "error": "FEATURE_DISABLED", "flagKey": "ENABLE_ADVANCED_UNITS" }
```

### 2. Si flag OFF → UI no muestra controles
```tsx
// El componente no se renderiza si flag OFF
<FeatureGate flag="ENABLE_ADVANCED_UNITS">
  <AdvancedUnitSelector />
</FeatureGate>
```

### 3. Si flag OFF → Checkout no cambia resultados
```ts
// Dentro de checkout:
if (await isFeatureEnabled(storeId, 'ENABLE_BATCH_EXPIRY')) {
  // Solo si flag ON: deducir stock del lote más antiguo (FIFO)
} else {
  // Flujo normal de bodega
}
```

### 4. Activar flag → Módulo funciona

### 5. Desactivar flag → Vuelve al comportamiento anterior

---

## 📋 Checklist de Regresión

Antes de cada release, ejecutar este checklist:

### BODEGA_BASELINE (Obligatorio)
- [ ] Venta CASH completa exitosa
- [ ] Venta YAPE completa exitosa
- [ ] Abrir turno sin errores
- [ ] Cerrar turno con cuadre correcto
- [ ] Imprimir ticket sin errores
- [ ] Crear producto nuevo
- [ ] Editar stock de producto
- [ ] Exportar CSV de ventas del día
- [ ] Promociones se aplican correctamente
- [ ] Cupones se validan y aplican
- [ ] Fiado registra cuenta por cobrar

### Verificación de Aislamiento
- [ ] `/api/units` retorna 403 en BODEGA (flag OFF)
- [ ] `/api/services` retorna 403 en BODEGA (flag OFF)
- [ ] `/api/work-orders` retorna 403 en BODEGA (flag OFF)
- [ ] `/api/reservations` retorna 403 en BODEGA (flag OFF)
- [ ] `/api/batches` retorna 403 en BODEGA (flag OFF)
- [ ] UI no muestra selector de unidades en BODEGA
- [ ] UI no muestra sección de servicios en BODEGA
- [ ] Checkout de BODEGA produce mismo resultado con/sin flags multi-rubro

---

## 🚀 Proceso de Rollout

### Paso 1: Desarrollo
- Implementar módulo con flag OFF por defecto
- Todos los endpoints protegidos con `requireFlag()`
- UI envuelta en `<FeatureGate>`

### Paso 2: Pruebas Internas
- Activar flag solo en tienda `TEST_INTERNAL`
- Ejecutar checklist del perfil correspondiente
- Verificar que BODEGA_BASELINE sigue funcionando

### Paso 3: Piloto
- Activar flag en 1 cliente piloto (tienda real)
- Monitorear errores y feedback
- Rollback inmediato si hay problemas (solo apagar flag)

### Paso 4: Rollout Gradual
- Activar en 10% de tiendas elegibles
- Aumentar gradualmente: 25% → 50% → 100%
- Cada paso con validación de métricas

### Paso 5: GA (General Availability)
- Activar por defecto para nuevas tiendas del rubro
- Documentar en onboarding
- Mantener flag para rollback de emergencia

---

## 📊 Métricas de Estabilidad

Monitorear estas métricas durante rollout:

| Métrica | Umbral Aceptable |
|---------|------------------|
| Tasa de error checkout | < 0.1% |
| Tiempo respuesta P95 | < 500ms |
| Quejas de usuarios | 0 relacionadas a bodegas |
| Flags desactivados por error | 0 |

---

## 🔧 Troubleshooting

### "La función X no aparece"
1. Verificar que el flag está ON: `GET /api/flags`
2. Limpiar cache del navegador
3. Verificar rol del usuario

### "Error 403 FEATURE_DISABLED"
1. Verificar flag en configuración de tienda
2. Contactar admin para habilitar

### "Checkout se comporta diferente"
1. Verificar qué flags están activos
2. Comparar con BODEGA_BASELINE
3. Si es regresión → apagar flags nuevos y reportar

---

*Documento generado automáticamente — MÓDULO V0*
*Última actualización: 2026-02-05*
