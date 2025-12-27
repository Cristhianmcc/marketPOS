# MÓDULO 14.2-C1 — PROMOCIONES POR VOLUMEN (PACK FIJO) — CHECKLIST DE TESTING

**Fecha:** 26/12/2025
**Módulo:** Promociones por Volumen (Pack Fijo)

---

## 📋 CHECKLIST OBLIGATORIO (12 PRUEBAS)

### TEST 1: Crear pack 3xS/5
- [ ] Ir a /volume-promotions
- [ ] Crear promoción:
  - Nombre: "3x5 Inca Kola"
  - Producto: Inca Kola 1L (UNIT)
  - Cantidad requerida: 3
  - Precio pack: 5.00
  - Vigencia: Sin fechas (siempre activa)
- [ ] ✅ Verificar que se crea correctamente
- [ ] ✅ Estado: "Activa"

---

### TEST 2: Vender qty=3 → aplica pack
- [ ] Ir a POS
- [ ] Agregar 3 Inca Kolas al carrito
- [ ] ✅ Verificar badge naranja: "PACK 3x: 3x5 Inca Kola"
- [ ] ✅ Verificar descuento calculado:
  - Precio normal: 3 × S/ 4.00 = S/ 12.00
  - Precio con pack: S/ 5.00
  - Descuento: S/ 7.00
- [ ] ✅ Resumen muestra "Promos Pack: -S/ 7.00"
- [ ] Finalizar venta
- [ ] ✅ Ticket muestra: "PACK 3x: 3x5 Inca Kola -S/ 7.00"

---

### TEST 3: Vender qty=7 → aplica 2 packs + 1 normal
- [ ] Agregar 7 Inca Kolas al carrito
- [ ] ✅ Verificar descuento calculado:
  - 2 packs (6 uds): 2 × S/ 5.00 = S/ 10.00
  - 1 normal: 1 × S/ 4.00 = S/ 4.00
  - Total con pack: S/ 14.00
  - Precio normal: 7 × S/ 4.00 = S/ 28.00
  - Descuento: S/ 14.00
- [ ] ✅ Badge muestra descuento correcto
- [ ] Finalizar venta
- [ ] ✅ Ticket correcto

---

### TEST 4: Vender qty=2 → NO aplica
- [ ] Agregar 2 Inca Kolas al carrito
- [ ] ✅ NO debe aparecer badge de pack
- [ ] ✅ Precio normal: 2 × S/ 4.00 = S/ 8.00
- [ ] ✅ Sin descuento de pack

---

### TEST 5: Producto KG → NO aplica
- [ ] Crear promoción para producto KG (ejemplo: Papa)
- [ ] Agregar producto KG al carrito
- [ ] ✅ NO debe aplicar la promoción
- [ ] ✅ Validación: Solo productos UNIT

---

### TEST 6: Promo producto + pack → orden correcto
- [ ] Producto con promoción automática (2x1 o PACK_PRICE)
- [ ] Que también tenga pack de volumen configurado
- [ ] ✅ Debe aplicar SOLO la promoción de producto
- [ ] ✅ Pack por volumen NO debe aplicar
- [ ] ✅ Orden: producto → categoría → volumen → manual

---

### TEST 7: Promo categoría + pack → orden correcto
- [ ] Producto SIN promoción de producto
- [ ] CON promoción de categoría (ejemplo: 15% Bebidas)
- [ ] CON pack de volumen (3x5)
- [ ] Agregar 3 unidades
- [ ] ✅ Debe aplicar promoción de categoría PRIMERO
- [ ] ✅ Luego aplicar pack de volumen
- [ ] ✅ Ambos descuentos visibles en el carrito

---

### TEST 8: Pack + descuento manual → orden correcto
- [ ] Agregar 3 Inca Kolas (activa pack 3x5)
- [ ] Aplicar descuento manual (10%)
- [ ] ✅ Pack aplica primero
- [ ] ✅ Descuento manual se calcula sobre el subtotal DESPUÉS del pack
- [ ] ✅ Ambos descuentos visibles

---

### TEST 9: Pack + cupón → orden correcto
- [ ] Agregar 3 Inca Kolas (activa pack 3x5)
- [ ] Aplicar cupón global (ejemplo: NAVIDAD10)
- [ ] ✅ Pack aplica primero
- [ ] ✅ Cupón se aplica al total después de pack
- [ ] ✅ Ticket muestra ambos descuentos

---

### TEST 10: Ticket muestra PACK
- [ ] Realizar venta con pack (TEST 2)
- [ ] Abrir ticket /receipt/[id]
- [ ] ✅ Debe mostrar línea: "PACK 3x: 3x5 Inca Kola -S/ 7.00"
- [ ] ✅ Total línea correcto
- [ ] Imprimir y verificar formato 80mm

---

### TEST 11: CSV incluye columnas pack
- [ ] Ir a Reportes → Exportar
- [ ] Descargar CSV de Items
- [ ] ✅ Debe incluir columnas:
  - Vol Promo Nombre
  - Vol Promo Qty
  - Vol Promo Monto
- [ ] ✅ Valores correctos para ventas con pack

---

### TEST 12: Anulación revierte stock y totales
- [ ] Realizar venta con pack (TEST 2)
- [ ] Verificar stock actual
- [ ] Anular la venta
- [ ] ✅ Stock debe regresar (3 Inca Kolas)
- [ ] ✅ Totales en 0
- [ ] ✅ Ticket marca "ANULADO"

---

## 📊 RESULTADOS

**Total pruebas:** 12
**Aprobadas:** ___ / 12
**Fallidas:** ___ / 12

---

## ⚠️ VALIDACIONES CRÍTICAS

### Prioridad ALTA:
1. ✅ Solo productos UNIT
2. ✅ Cantidades enteras obligatorias
3. ✅ Cálculo de packs: floor(qty / reqQty)
4. ✅ Orden de aplicación correcto
5. ✅ Descuento nunca negativo
6. ✅ ACID transaction intacta

### Prioridad MEDIA:
7. ✅ UI clara (badges, totales)
8. ✅ Ticket legible 80mm
9. ✅ CSV exporta correctamente

### Prioridad BAJA:
10. ✅ Reportes muestran totales
11. ✅ Navegación funcional
12. ✅ Modales sin errores

---

## 🐛 BUGS ENCONTRADOS

_(Listar aquí cualquier bug encontrado durante testing)_

1. 
2. 
3. 

---

## 📝 NOTAS

- Fecha de testing: ______________
- Tester: ______________
- Ambiente: ______________
- Versión: ______________

---

## ✅ APROBACIÓN FINAL

- [ ] Todos los tests críticos pasan
- [ ] No hay bugs bloqueantes
- [ ] Documentación actualizada
- [ ] Listo para producción

**Firma:** _________________ **Fecha:** _________________
