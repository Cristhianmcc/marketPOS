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

## Resultado de la Fase 0 (2026-10-27)

Banco: `npm run test:lavanderia:isolated` (con `--strict` sale con error si
algo no pasa). 5/13 correctos.

| Caso | Resultado | Detalle |
| --- | --- | --- |
| L1 rubro trae órdenes de trabajo | FALTA | El rubro solo activa `ENABLE_SERVICES`. |
| L2 recibir 3,5 kg + 2 prendas = 47,50 | PASS | |
| L3 precio del catálogo | REGLA | La orden acepta el precio que manda la pantalla (3 kg a S/ 1). Decidir si el cajero puede cambiar precios. |
| L4 rechaza media prenda | FAIL | Acepta 1,5 de un servicio por prenda; no valida decimales por unidad. |
| L5 Recibido → En proceso → Listo | PASS | |
| L6 no entregar sin cobrar | FAIL | `PATCH` permite pasar a CLOSED sin venta; el estado se acepta tal cual llega. |
| L7 adelanto | FALTA | No existe registro de pagos de la orden. |
| L8 recargo express | FALTA | |
| L9 entrega con cobro y vuelto | PASS | |
| L10 IGV en la venta | FAIL | La venta queda con `tax = 0` y sin IGV por línea; reportes y ticket muestran IGV 0. La boleta sí calcula 40,25 + 7,25 porque lo recalcula desde el total. |
| L11 cobro doble simultáneo | PASS (frágil) | Una sola venta en la prueba, pero el código revisa `saleId` fuera de la transacción y no condiciona la actualización. Se blinda en la Fase 2. |
| L12 caja del turno | PASS | |
| L13 anular venta de orden entregada | REGLA | La orden queda CLOSED apuntando a una venta anulada. Decidir si vuelve a Listo o se cancela. |

Otros riesgos vistos en el código (sin caso propio todavía):
`convert-to-sale` escribe el stock de productos como valor absoluto leído
antes (patrón H14) y calcula el número de venta con máximo + 1; el número de
orden también usa máximo + 1 fuera de la transacción.

## Resultado de la Fase 1 (2026-10-27)

Banco 12/14; solo faltan L7 (adelanto, Fase 2) y L8 (express, Fase 3).

- L1: el rubro activa `ENABLE_WORK_ORDERS`; las pantallas muestran Recibido y
  Entregado en lavandería.
- L3 (decisión del dueño): el cajero cobra el precio del catálogo; solo OWNER
  puede cambiarlo en la orden.
- L4: los servicios y productos con unidad sin decimales exigen enteros. Un
  servicio sin unidad sigue admitiendo decimales (horas de mano de obra).
- L6: CLOSED solo cobrando y CANCELLED solo anulando; responde 409.
- L10: corregida la expectativa. La venta guarda `tax = 0` igual que el cobro
  del POS; el IGV se calcula al emitir y la boleta da 40,25 + 7,25.
- L11: el cobro reserva la orden dentro de la transacción. Se añadió un
  segundo cobro con lectura vieja: sin la reserva crea una venta duplicada
  (mutación detectada), con ella responde 409.
- L13 (decisión del dueño): anular la venta devuelve la orden a Listo y se
  puede volver a cobrar.
- L14: los productos de la orden descuentan stock con deltas condicionados.

Mutaciones detectadas: sin reserva de la orden (L11), sin control de estados
(L6), anulación sin devolver la orden (L13).

## Fases

0. Banco `scripts/test-lavanderia-flow-isolated.ts` (PostgreSQL desechable)
   que recorre: recibir orden 3,5 kg + 2 prendas, express, adelanto, cambios de
   estado, entrega con boleta, cierre de turno, anulación con adelanto.
   Documenta los fallos actuales antes de tocar código.
1. Rubro y correcciones: activar `ENABLE_WORK_ORDERS` en LAVANDERIA (y en el
   plan DEMO del rubro), etiquetas de estado por rubro, servicios de ejemplo
   por kilo y por prenda; corregir L4 (decimales por unidad), L6 (transiciones
   de estado válidas), L10 (IGV en venta e items con `computeLineTaxes`) y el
   stock atómico al convertir.
2. Adelanto: migración aditiva `WorkOrderPayment` + `Sale.advanceApplied`,
   API de cobro de adelanto, conversión a venta con saldo, cierre de turno y
   reporte de caja que cuentan adelanto y saldo una sola vez.
3. Kilo/prenda/express: validación de decimales por unidad, recargo express,
   fecha prometida.
4. Pantallas y ticket: recepción rápida, lista por estado (Recibido / En
   proceso / Listo), ticket de recepción y de entrega.

Cada fase cierra con su banco en verde, mutación detectada y regresión.
