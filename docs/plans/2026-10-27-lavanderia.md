# Plan: lavandería (seguimiento de prendas, adelanto, kilo/prenda, express)

Fecha: 2026-10-27. Decisiones del dueño: adelanto al recibir; precio por kilo y
por prenda; recargo express.

## Estado actual (verificado en código)

- El rubro `LAVANDERIA` (`src/lib/businessProfiles.ts`) solo activa
  `ENABLE_SERVICES`. No activa `ENABLE_WORK_ORDERS`, así que hoy una lavandería
  solo puede cobrar servicios en el POS al momento; no hay registro de prendas
  recibidas ni estado.
- Las órdenes de trabajo existen (`WorkOrder`, `WorkOrderItem`,
  `/api/work-orders`, `/work-orders`) con estados DRAFT → APPROVED →
  IN_PROGRESS → READY → CLOSED/CANCELLED y conversión a venta
  (`convert-to-sale`). Las usa el taller.
- `WorkOrderItem.quantityBase` es decimal, así que admite kilos; falta
  comprobar que un servicio con unidad KGM se pueda cobrar con decimales de
  punta a punta.
- No existe adelanto: la orden no registra pagos y la caja solo ve la venta
  final.

## Diseño

- Reusar órdenes de trabajo. Mostrar los estados con nombres de lavandería:
  Recibido (APPROVED), En proceso (IN_PROGRESS), Listo (READY), Entregado
  (CLOSED). Sin enum nuevo.
- Adelanto: modelo nuevo `WorkOrderPayment` (orden, turno, monto, método,
  usuario, fecha). El dinero entra a la caja del turno en que se cobra.
- Al entregar se convierte en venta por el total (boleta/factura por el total
  del servicio). La venta guarda el adelanto aplicado; en caja solo se cuenta
  el saldo cobrado ese día, para no contar dos veces el adelanto.
- Anticipos SUNAT (factura de anticipo con deducción) quedan fuera: el
  adelanto es un pago a cuenta no fiscal y el comprobante se emite al entregar.
  Si la orden se anula con adelanto, se registra la devolución como salida de
  caja.
- Precio por kilo: servicio con unidad KGM y cantidad decimal. Por prenda:
  servicio NIU entero. Express: casilla en la orden que agrega un recargo
  porcentual configurable (por defecto 50 %) como línea propia.
- Ticket de recepción para el cliente: número de orden, prendas, fecha
  prometida, total, adelanto y saldo.

## Fases

0. Banco `scripts/test-lavanderia-flow-isolated.ts` (PostgreSQL desechable)
   que recorre: recibir orden 3,5 kg + 2 prendas, express, adelanto, cambios de
   estado, entrega con boleta, cierre de turno, anulación con adelanto.
   Documenta los fallos actuales antes de tocar código.
1. Rubro: activar `ENABLE_WORK_ORDERS` en LAVANDERIA (y en el plan DEMO del
   rubro), etiquetas de estado por rubro, servicios de ejemplo por kilo y
   por prenda.
2. Adelanto: migración aditiva `WorkOrderPayment` + `Sale.advanceApplied`,
   API de cobro de adelanto, conversión a venta con saldo, cierre de turno y
   reporte de caja que cuentan adelanto y saldo una sola vez.
3. Kilo/prenda/express: validación de decimales por unidad, recargo express,
   fecha prometida.
4. Pantallas y ticket: recepción rápida, lista por estado (Recibido / En
   proceso / Listo), ticket de recepción y de entrega.

Cada fase cierra con su banco en verde, mutación detectada y regresión.
