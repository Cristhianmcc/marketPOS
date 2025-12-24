# CHECKLIST DE TESTING - MÓDULO 5: TURNOS/CORTE DE CAJA

## ✅ PRUEBAS OBLIGATORIAS

### 1. Abrir Turno como CASHIER
- [ ] Ir a `/shifts`
- [ ] Verificar que muestra "No hay turno abierto"
- [ ] Click en "Abrir Turno"
- [ ] Ingresar caja inicial (ej: 50.00)
- [ ] Verificar que se abre correctamente
- [ ] Verificar que muestra hora de apertura y caja inicial

### 2. Intentar Vender sin Turno (409)
- [ ] Cerrar el turno abierto
- [ ] Ir a `/pos`
- [ ] Verificar banner amarillo: "Debes abrir turno para vender"
- [ ] Agregar productos al carrito
- [ ] Click en "Finalizar Venta"
- [ ] Verificar que muestra error: "Debes abrir un turno antes de realizar ventas"

### 3. Vender con Turno (sale.shiftId no null)
- [ ] Abrir turno con caja inicial (ej: 100.00)
- [ ] Ir a `/pos`
- [ ] Verificar banner verde: "Turno abierto • Caja inicial S/ 100.00"
- [ ] Agregar productos al carrito
- [ ] Realizar venta exitosamente
- [ ] Verificar en base de datos que `sale.shiftId` no es null

### 4. Cerrar Turno con closingCash y ver expected/difference
- [ ] Ir a `/shifts`
- [ ] Verificar que muestra:
  - Hora de apertura
  - Caja inicial
  - Ventas en efectivo acumuladas
  - Efectivo esperado = caja inicial + ventas
- [ ] Click en "Cerrar Turno"
- [ ] Ingresar caja final (ej: más o menos que esperado)
- [ ] Agregar notas opcionales
- [ ] Verificar que calcula diferencia correctamente:
  - Verde si sobra (+)
  - Rojo si falta (-)
- [ ] Cerrar turno y verificar en historial

### 5. OWNER ve todos, CASHIER solo los suyos
**Como CASHIER:**
- [ ] Abrir y cerrar un turno
- [ ] Ir a `/shifts` → Historial
- [ ] Verificar que solo ve sus propios turnos

**Como OWNER:**
- [ ] Ir a `/shifts` → Historial
- [ ] Verificar que ve todos los turnos de la tienda
- [ ] Verificar que puede cerrar turnos de otros usuarios

### 6. Validaciones de Apertura
- [ ] Intentar abrir turno con caja inicial negativa
- [ ] Verificar error: "La caja inicial debe ser mayor o igual a 0"
- [ ] Abrir un turno
- [ ] Intentar abrir otro turno sin cerrar el primero
- [ ] Verificar error 409: "Ya tienes un turno abierto"

### 7. Validaciones de Cierre
- [ ] Intentar cerrar turno con caja final negativa
- [ ] Verificar error: "La caja final debe ser mayor o igual a 0"
- [ ] Como CASHIER, intentar cerrar turno de otro usuario
- [ ] Verificar error 403: "No tienes permiso para cerrar este turno"

### 8. Integración con Checkout
- [ ] Realizar varias ventas en efectivo (CASH)
- [ ] Realizar venta con YAPE (no debe contar para esperado)
- [ ] Ir a `/shifts`
- [ ] Verificar que "Ventas en efectivo" solo cuenta CASH
- [ ] Verificar que "Efectivo esperado" es correcto

### 9. UI del POS con Turno
- [ ] Sin turno abierto:
  - [ ] Banner amarillo visible
  - [ ] Botón "Finalizar Venta" deshabilitado
  - [ ] Mensaje en botón: "Abrir turno para vender"
  - [ ] Botón "Abrir Turno" funcional en banner

- [ ] Con turno abierto:
  - [ ] Banner verde visible con caja inicial
  - [ ] Botón "Finalizar Venta" habilitado
  - [ ] Ventas se procesan correctamente

### 10. Historial y Cálculos
- [ ] Realizar múltiples ventas
- [ ] Cerrar turno
- [ ] Verificar en historial:
  - [ ] Fecha/hora apertura
  - [ ] Fecha/hora cierre
  - [ ] Caja inicial correcta
  - [ ] Esperado = inicial + ventas CASH
  - [ ] Caja final = lo ingresado
  - [ ] Diferencia = final - esperado
  - [ ] Color correcto (verde/rojo/gris)
  - [ ] Nombre de quien abrió

## 🔧 QUERIES DE VALIDACIÓN (PostgreSQL)

### Ver turno actual de un usuario
```sql
SELECT * FROM shifts 
WHERE store_id = 'TU_STORE_ID' 
  AND opened_by = 'USER_ID' 
  AND closed_at IS NULL;
```

### Ver ventas de un turno
```sql
SELECT * FROM sales 
WHERE shift_id = 'SHIFT_ID';
```

### Verificar ventas CASH de un turno
```sql
SELECT SUM(total) as cash_sales 
FROM sales 
WHERE shift_id = 'SHIFT_ID' 
  AND payment_method = 'CASH';
```

### Ver historial de turnos
```sql
SELECT 
  s.*,
  u1.name as opened_by_name,
  u2.name as closed_by_name
FROM shifts s
LEFT JOIN users u1 ON s.opened_by = u1.id
LEFT JOIN users u2 ON s.closed_by = u2.id
WHERE s.store_id = 'TU_STORE_ID'
ORDER BY s.opened_at DESC;
```

## 📊 CASOS EDGE

### Concurrencia
- [ ] Dos usuarios intentan abrir turno al mismo tiempo
- [ ] Verificar que ambos endpoints respetan la validación

### Datos Límite
- [ ] Caja inicial = 0
- [ ] Caja final = 0
- [ ] Diferencia = 0 (exacto)
- [ ] Turno sin ventas (esperado = inicial)

### Errores de Red
- [ ] Simular error al abrir turno
- [ ] Verificar que modal no se cierra
- [ ] Simular error al cerrar turno
- [ ] Verificar que no se pierde información ingresada

## ✅ CRITERIOS DE ÉXITO

- [ ] Todos los endpoints responden correctamente
- [ ] Validaciones funcionan según roles
- [ ] Cálculos de esperado y diferencia son precisos
- [ ] UI refleja estado en tiempo real
- [ ] No se pueden realizar ventas sin turno
- [ ] sale.shiftId siempre tiene valor cuando hay turno
- [ ] Historial muestra datos correctos según rol
- [ ] Manejo de errores es claro y consistente

## 🎯 COMANDOS ÚTILES

```bash
# Ver logs del servidor
npm run dev

# Limpiar turnos de prueba
psql -d market_pos -c "DELETE FROM shifts WHERE store_id = 'TU_STORE_ID';"

# Ver estructura de shifts
psql -d market_pos -c "\d shifts"
```

---

**NOTA:** Realizar todas las pruebas con datos reales simulando un día normal de operación en la bodega.
