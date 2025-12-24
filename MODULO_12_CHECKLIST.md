# CHECKLIST MANUAL - MÓDULO 12: CLIENTES + FIADO

## ✅ Validaciones a realizar antes de Deploy

### 1. Día 1: Venta FIADO no afecta expectedCash del turno
**Pasos:**
- [ ] Abrir turno con S/ 100.00 caja inicial
- [ ] Crear cliente "Juan Pérez" tel: 987654321
- [ ] Hacer venta FIADO: 2 productos = S/ 10.00
- [ ] Verificar en Turnos/Caja: "Ventas en efectivo: S/ 0.00"
- [ ] Verificar "Efectivo esperado: S/ 100.00" (sin cambios)
- [ ] Cerrar turno: Diferencia debe ser S/ 0.00

**Resultado esperado:** ✅ Venta FIADO no suma a expectedCash del turno actual

---

### 2. Día 2: Pago FIADO en CASH aumenta expectedCash
**Pasos:**
- [ ] Abrir nuevo turno con S/ 100.00 caja inicial
- [ ] Ir a Cuentas por Cobrar → Tab "Abiertas"
- [ ] Buscar deuda de "Juan Pérez" (S/ 10.00)
- [ ] Click "Cobrar" → Monto: S/ 10.00, Método: CASH
- [ ] Confirmar pago
- [ ] Ir a Turnos/Caja
- [ ] Verificar "Ventas en efectivo: S/ 0.00"
- [ ] Verificar "Efectivo esperado: S/ 110.00" (100 inicial + 10 pago FIADO)

**Resultado esperado:** ✅ Pago CASH de FIADO suma a expectedCash

---

### 3. Pago parcial reduce saldo correctamente
**Pasos:**
- [ ] Crear cliente "María García"
- [ ] Venta FIADO: S/ 100.00
- [ ] Ir a Cuentas por Cobrar
- [ ] Click "Cobrar" → Monto: S/ 50.00
- [ ] Confirmar pago
- [ ] Verificar saldo actualizado: S/ 50.00
- [ ] Verificar estado: "Abierta" (status=OPEN)

**Resultado esperado:** ✅ Saldo baja de S/ 100 → S/ 50, estado sigue OPEN

---

### 4. Pago total marca cuenta como PAID
**Pasos:**
- [ ] Continuar con "María García" (saldo S/ 50.00)
- [ ] Click "Cobrar" → Monto: S/ 50.00
- [ ] Confirmar pago
- [ ] Verificar toast: "¡Cuenta pagada completamente!"
- [ ] Tab "Abiertas": ya no aparece María García
- [ ] Tab "Pagadas": aparece María García con saldo S/ 0.00

**Resultado esperado:** ✅ Status cambia a PAID, desaparece de Abiertas

---

### 5. Pago YAPE no afecta expectedCash
**Pasos:**
- [ ] Crear cliente "Pedro López"
- [ ] Venta FIADO: S/ 20.00
- [ ] Abrir turno con S/ 100.00 caja inicial
- [ ] Cobrar deuda: Método YAPE, S/ 20.00
- [ ] Verificar en Turnos/Caja: "Efectivo esperado: S/ 100.00" (sin cambios)
- [ ] Cerrar turno: Diferencia S/ 0.00

**Resultado esperado:** ✅ Pagos YAPE/PLIN/CARD no afectan expectedCash

---

### 6. Ticket FIADO muestra cliente y saldo pendiente
**Pasos:**
- [ ] Crear cliente "Ana Torres" tel: 999888777
- [ ] Venta FIADO: S/ 15.00
- [ ] Click "Imprimir Ticket"
- [ ] Verificar en ticket:
  - [ ] "Cliente: Ana Torres"
  - [ ] "Tel: 999888777"
  - [ ] "Pago: Fiado"
  - [ ] "Saldo pendiente: S/ 15.00"
  - [ ] "Cliente debe pagar en caja posteriormente"
  - [ ] NO muestra "Recibido" ni "Vuelto"

**Resultado esperado:** ✅ Ticket muestra info cliente y mensaje FIADO

---

### 7. Reportes muestran métricas de FIADO
**Pasos:**
- [ ] Hacer 2 ventas FIADO diferentes: S/ 30 y S/ 40
- [ ] Cobrar parcialmente una: S/ 20
- [ ] Ir a Reportes → Tab "Resumen"
- [ ] Verificar cards de FIADO:
  - [ ] "Total Vendido a Crédito: S/ 70.00" (30+40)
  - [ ] "Cobrado en el Período: S/ 20.00"
  - [ ] "Saldo Pendiente Total: S/ 50.00" (70-20)
- [ ] Verificar "Métodos de Pago" → aparece "FIADO: S/ 70.00"

**Resultado esperado:** ✅ Reportes muestran 3 métricas separadas

---

### 8. Anular venta FIADO cancela receivable
**Pasos:**
- [ ] Crear cliente "Carlos Ruiz"
- [ ] Venta FIADO: S/ 25.00
- [ ] Ir a Cuentas por Cobrar → verificar aparece con saldo S/ 25.00
- [ ] Ir a Ventas → buscar ticket de Carlos Ruiz
- [ ] Click "Anular" → confirmar
- [ ] Volver a Cuentas por Cobrar → Tab "Canceladas"
- [ ] Verificar: Carlos Ruiz aparece con estado "Cancelada", saldo S/ 0.00
- [ ] Tab "Abiertas": ya no aparece

**Resultado esperado:** ✅ Receivable cambia a CANCELLED, stock se revierte

---

### 9. expectedCash siempre cuadra en escenarios combinados
**Pasos:**
- [ ] Abrir turno: S/ 200.00 caja inicial
- [ ] Venta 1 CASH: S/ 10.00 (pago S/ 10, vuelto S/ 0)
- [ ] Venta 2 FIADO: S/ 50.00 (cliente nuevo)
- [ ] Venta 3 YAPE: S/ 30.00
- [ ] Cobrar deuda FIADO anterior: S/ 20 en CASH
- [ ] Venta 4 CASH: S/ 15.00 (pago S/ 20, vuelto S/ 5)
- [ ] Verificar cálculo:
  - Caja inicial: S/ 200.00
  - Venta 1 CASH: +S/ 10.00
  - Venta 2 FIADO: (no suma)
  - Venta 3 YAPE: (no suma)
  - Cobro FIADO CASH: +S/ 20.00
  - Venta 4 CASH: +S/ 15.00
  - **expectedCash = 200 + 10 + 20 + 15 = S/ 245.00**
- [ ] Cerrar turno con S/ 245.00 → Diferencia S/ 0.00

**Resultado esperado:** ✅ expectedCash cuadra perfectamente

---

## 📋 Validaciones Técnicas Adicionales

### Base de Datos
- [ ] Migración aplicada sin errores
- [ ] Tablas creadas: customers, receivables, receivable_payments
- [ ] Foreign keys correctas (onDelete: Cascade)
- [ ] Índices creados: storeId en customers

### Endpoints API
- [ ] GET/POST /api/customers funciona
- [ ] GET/PATCH /api/customers/:id funciona
- [ ] POST /api/sales/checkout acepta FIADO
- [ ] GET /api/receivables con filtros funciona
- [ ] POST /api/receivables/:id/pay valida turno abierto
- [ ] GET /api/reports/summary incluye métricas FIADO
- [ ] GET /api/reports/export/receivables genera CSV
- [ ] GET /api/reports/export/sales incluye columna Cliente

### UI/UX
- [ ] Menú muestra "Cuentas por Cobrar"
- [ ] POS: botón FIADO habilitado sin turno
- [ ] POS: selector cliente funciona con búsqueda
- [ ] POS: crear cliente rápido funciona
- [ ] /customers: búsqueda, crear, toggle active
- [ ] /receivables: tabs, cobrar, historial pagos
- [ ] Reportes: 3 cards FIADO con colores
- [ ] Ticket: muestra cliente cuando es FIADO

### Multi-tenant
- [ ] Todos los queries filtran por session.storeId
- [ ] CASHIER ve solo sus ventas en reportes
- [ ] Clientes aislados por tienda

---

## 🚀 Deploy Checklist

Antes de hacer push a producción:
- [ ] Todas las validaciones 1-9 pasadas ✅
- [ ] npm run build sin errores TypeScript
- [ ] Prisma migrate deploy ejecutado en Render
- [ ] Variables de entorno correctas (DATABASE_URL)
- [ ] Probar 1 venta FIADO en producción

---

**Fecha de validación:** _________________________
**Validado por:** _________________________
**Estado final:** ☐ APROBADO ☐ RECHAZADO
