# MÓDULO 14.2-C2 — CHECKLIST MANUAL DE PRUEBAS
## Promociones N-ésimo con Descuento

**Fecha:** 2025-12-27  
**Módulo:** 14.2-C2  
**Sistema:** POS + Promociones N-ésimo

---

## ✅ PRUEBAS ADMINISTRATIVAS (UI Admin)

### 1. Acceso y navegación
- [ ] Navegar a `/nth-promotions` desde el menú de administración
- [ ] Verificar que la página carga correctamente
- [ ] Verificar que solo muestra productos UNIT en el selector

### 2. Crear promociones
- [ ] Crear "2do al 50%" para un producto UNIT
  - Nombre: "2do al 50%"
  - N-ésimo: 2
  - Porcentaje: 50
  - Verificar que se crea correctamente
  
- [ ] Crear "3ro gratis" para otro producto
  - Nombre: "3ro gratis"
  - N-ésimo: 3
  - Porcentaje: 100
  - Verificar que se crea correctamente

- [ ] Intentar crear con N=1 (debe fallar)
- [ ] Intentar crear con porcentaje > 100 (debe fallar)
- [ ] Intentar crear con porcentaje <= 0 (debe fallar)

### 3. Gestionar promociones
- [ ] Activar/desactivar una promoción
- [ ] Verificar que el estado cambia correctamente
- [ ] Eliminar una promoción
- [ ] Verificar que se elimina correctamente

---

## ✅ PRUEBAS EN POS

### 4. 2do al 50% - Producto A
- [ ] **qty=1:** Agregar 1 unidad → NO debe aplicar descuento
- [ ] **qty=2:** Agregar 2 unidades → Debe aplicar 50% a 1 unidad
  - Verificar badge amarillo "2° al 50%"
  - Verificar monto de descuento correcto
  
- [ ] **qty=5:** Agregar 5 unidades → Debe aplicar 50% a 2 unidades
  - 5 / 2 = 2 grupos completos → 2 unidades descontadas
  - Verificar cálculo correcto

### 5. 3ro gratis - Producto B
- [ ] **qty=1:** Agregar 1 unidad → NO debe aplicar descuento
- [ ] **qty=2:** Agregar 2 unidades → NO debe aplicar descuento
- [ ] **qty=3:** Agregar 3 unidades → Debe aplicar 100% a 1 unidad (gratis)
  - Verificar badge "3° al 100%"
  - Verificar que 1 unidad es gratis
  
- [ ] **qty=6:** Agregar 6 unidades → Debe aplicar 100% a 2 unidades
  - 6 / 3 = 2 grupos → 2 unidades gratis
  - Verificar cálculo correcto

### 6. Orden de descuentos (prioridad)
- [ ] Producto con **promo producto (2x1)** + **nth promo**
  - Solo debe aplicar la promo de producto
  - Nth promo NO debe aplicar
  
- [ ] Producto con **promo categoría** + **nth promo**
  - Ambas deben aplicar (categoría primero, nth después)
  
- [ ] Producto con **promo volumen** + **nth promo**
  - Ambas deben aplicar (volumen primero, nth después)
  
- [ ] Producto con **nth promo** + **descuento manual**
  - Ambos deben aplicar (nth primero, manual después)

### 7. Totales en POS
- [ ] Verificar que "Promos N-ésimo" aparece en el resumen
- [ ] Verificar que el monto es correcto
- [ ] Verificar que el total final es correcto

---

## ✅ PRUEBAS DE CHECKOUT

### 8. Checkout con nth promo
- [ ] Completar venta con nth promo
  - Método: Efectivo
  - Verificar que la venta se registra correctamente
  - Verificar que no hay errores
  
- [ ] Completar venta con cupón + nth promo
  - Ambos descuentos deben aplicar
  - Total final correcto

### 9. Checkout FIADO
- [ ] Venta FIADO con nth promo
  - Seleccionar cliente
  - Verificar que se crea el receivable correcto

---

## ✅ PRUEBAS DE TICKET 80mm

### 10. Ticket impreso
- [ ] Abrir ticket de venta con nth promo
- [ ] Verificar que muestra:
  ```
  2° al 50%: [Nombre Promo]   -S/ X.XX
  ```
  o
  ```
  3° al 100%: [Nombre Promo]  -S/ X.XX
  ```
- [ ] Verificar que el total línea es correcto
- [ ] Verificar que el total final es correcto

---

## ✅ PRUEBAS DE REPORTES

### 11. Reporte resumen
- [ ] Ir a Reportes → Resumen
- [ ] Verificar card "Promos N-ésimo" (amarillo)
- [ ] Verificar que el monto es correcto
- [ ] Cambiar rango de fechas y verificar

### 12. Exportar CSV Items
- [ ] Exportar CSV de ítems
- [ ] Verificar columnas:
  - Nth Promo Nombre
  - Nth Promo N
  - Nth Promo %
  - Nth Promo Monto
- [ ] Verificar que los datos son correctos

---

## ✅ PRUEBAS DE ANULACIÓN

### 13. Anular venta con nth promo
- [ ] Crear venta con nth promo
- [ ] Anotar el stock antes de la venta
- [ ] Completar la venta
- [ ] Anular la venta
- [ ] Verificar que:
  - Stock se revierte correctamente
  - Totales quedan en 0
  - Ticket muestra "ANULADO"
  - Reportes NO incluyen la venta anulada

---

## ✅ PRUEBAS DE INTEGRACIÓN

### 14. Casos complejos
- [ ] Carrito con múltiples productos
  - Producto A con nth promo
  - Producto B sin nth promo
  - Producto C con nth promo diferente
  - Descuento global
  - Cupón
  - Verificar que todos los cálculos son correctos

### 15. Productos KG (no deben tener nth promo)
- [ ] Intentar crear nth promo para producto KG (debe fallar)
- [ ] Verificar que productos KG no aparecen en selector

---

## ✅ CONFIRMACIONES FINALES

### 16. Verificar integridad del sistema
- [ ] **Checkout ACID:** Transacciones siguen siendo atómicas
- [ ] **Retry saleNumber:** Funciona correctamente
- [ ] **Stock:** Se decrementa correctamente
- [ ] **FIADO:** Compatible y funcional
- [ ] **Turnos:** No se rompieron
- [ ] **Tickets:** Se imprimen correctamente
- [ ] **Reportes:** Muestran datos correctos
- [ ] **CSV:** Exporta correctamente
- [ ] **Anulación:** Revierte todo correctamente

### 17. Pruebas de carga (opcional)
- [ ] 10 ventas con nth promo
- [ ] Verificar que no hay degradación de performance
- [ ] Verificar que los totales son correctos

---

## 📝 NOTAS Y OBSERVACIONES

```
Espacio para anotar cualquier comportamiento inesperado, bugs encontrados,
o mejoras sugeridas durante las pruebas.

```

---

## ✅ APROBACIÓN FINAL

- [ ] Todos los tests pasaron correctamente
- [ ] No se encontraron bugs críticos
- [ ] Sistema estable y funcional
- [ ] Documentación actualizada

**Responsable:** _________________  
**Fecha:** _________________  
**Firma:** _________________  

---

## 🎯 RESULTADOS ESPERADOS

1. ✅ Nth promotions funcionan correctamente en POS
2. ✅ Checkout mantiene ACID y retry saleNumber
3. ✅ Tickets muestran nth promos correctamente
4. ✅ Reportes incluyen nth promos
5. ✅ CSV exporta columnas de nth promos
6. ✅ Anulación funciona correctamente
7. ✅ No se rompió ninguna funcionalidad existente
