/**
 * Adelantos de órdenes de trabajo. El dinero entra a la caja del turno en que
 * se cobra; al entregar, la venta guarda el total y descuenta el adelanto
 * (`Sale.advanceApplied`) para que la caja no lo cuente dos veces.
 */
import { Prisma, PaymentMethod, WorkOrderStatus } from '@prisma/client';
import { WorkOrderRuleError } from './rules';

export const ADVANCE_METHODS: PaymentMethod[] = ['CASH', 'YAPE', 'PLIN', 'CARD'];

const OPEN_STATUSES: WorkOrderStatus[] = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'READY'];

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Bloquea la fila de la orden hasta el fin de la transacción. */
export async function lockWorkOrder(tx: Prisma.TransactionClient, storeId: string, workOrderId: string) {
  await tx.$queryRaw`SELECT id FROM "work_orders" WHERE id = ${workOrderId} AND store_id = ${storeId} FOR UPDATE`;
  const order = await tx.workOrder.findFirst({ where: { id: workOrderId, storeId } });
  if (!order) throw new WorkOrderRuleError('Orden no encontrada', 404);
  return order;
}

export async function recordAdvance(
  tx: Prisma.TransactionClient,
  input: { storeId: string; workOrderId: string; shiftId: string; userId: string; amount: number; method: PaymentMethod; notes?: string | null }
) {
  if (!ADVANCE_METHODS.includes(input.method)) {
    throw new WorkOrderRuleError('El adelanto se cobra en efectivo, Yape, Plin o tarjeta');
  }
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new WorkOrderRuleError('El adelanto debe ser mayor a 0');

  const order = await lockWorkOrder(tx, input.storeId, input.workOrderId);
  if (!OPEN_STATUSES.includes(order.status) || order.saleId) {
    throw new WorkOrderRuleError('La orden ya fue cobrada o cancelada', 409);
  }
  const advancePaid = round2(order.advancePaid.toNumber() + amount);
  if (advancePaid > order.total.toNumber()) {
    const pending = round2(order.total.toNumber() - order.advancePaid.toNumber());
    throw new WorkOrderRuleError(`El adelanto supera el saldo de la orden (pendiente S/ ${pending.toFixed(2)})`, 409);
  }

  const payment = await tx.workOrderPayment.create({
    data: {
      storeId: input.storeId,
      workOrderId: order.id,
      shiftId: input.shiftId,
      kind: 'ADVANCE',
      amount: new Prisma.Decimal(amount),
      method: input.method,
      notes: input.notes ?? null,
      createdById: input.userId,
    },
  });
  await tx.workOrder.update({ where: { id: order.id }, data: { advancePaid: new Prisma.Decimal(advancePaid) } });
  return { payment, advancePaid, balance: round2(order.total.toNumber() - advancePaid) };
}

/**
 * Devuelve el adelanto neto de cada método (al anular la orden). La orden ya
 * debe estar bloqueada con `lockWorkOrder`.
 */
export async function refundAdvances(
  tx: Prisma.TransactionClient,
  input: { storeId: string; workOrderId: string; shiftId: string; userId: string; reason: string }
): Promise<number> {
  const payments = await tx.workOrderPayment.findMany({ where: { workOrderId: input.workOrderId, storeId: input.storeId } });
  const netByMethod = new Map<PaymentMethod, number>();
  for (const p of payments) {
    const signed = p.kind === 'REFUND' ? -p.amount.toNumber() : p.amount.toNumber();
    netByMethod.set(p.method, round2((netByMethod.get(p.method) ?? 0) + signed));
  }
  let refunded = 0;
  for (const [method, net] of netByMethod) {
    if (net <= 0) continue;
    await tx.workOrderPayment.create({
      data: {
        storeId: input.storeId,
        workOrderId: input.workOrderId,
        shiftId: input.shiftId,
        kind: 'REFUND',
        amount: new Prisma.Decimal(net),
        method,
        notes: input.reason,
        createdById: input.userId,
      },
    });
    refunded = round2(refunded + net);
  }
  await tx.workOrder.update({ where: { id: input.workOrderId }, data: { advancePaid: new Prisma.Decimal(0) } });
  return refunded;
}

/** Neto de adelantos por método en un turno (ADVANCE − REFUND). */
export async function advancesByMethodForShift(db: Prisma.TransactionClient | { workOrderPayment: Prisma.TransactionClient['workOrderPayment'] }, shiftId: string) {
  const groups = await db.workOrderPayment.groupBy({
    by: ['method', 'kind'],
    where: { shiftId },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const result: Record<string, { total: number; count: number }> = {};
  for (const g of groups) {
    const amount = g._sum.amount?.toNumber() ?? 0;
    const entry = result[g.method] ?? { total: 0, count: 0 };
    entry.total = round2(entry.total + (g.kind === 'REFUND' ? -amount : amount));
    entry.count += g._count._all;
    result[g.method] = entry;
  }
  return result;
}
