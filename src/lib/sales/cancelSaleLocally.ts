import type { PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | any;

interface BatchBreakdownEntry {
  batchNumber?: string;
  qty?: number;
  quantity?: number;
}

/**
 * Revierte una venta una sola vez. Los importes se ponen en cero para conservar
 * la compatibilidad con los reportes existentes; el comprobante fiscal mantiene
 * el snapshot original. También devuelve las cantidades FEFO a sus lotes.
 */
export async function cancelSaleLocally(
  db: DbClient,
  saleId: string,
  actorUserId: string,
  reason: string
): Promise<{ cancelled: boolean }> {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: { items: true },
  });
  if (!sale) throw new Error('Venta no encontrada');
  if (Number(sale.total) === 0 && Number(sale.subtotal) === 0) return { cancelled: false };

  return db.$transaction(async (tx: any) => {
    const claimed = await tx.sale.updateMany({
      where: { id: saleId, total: { not: 0 } },
      data: { total: 0, subtotal: 0, tax: 0 },
    });
    if (claimed.count !== 1) return { cancelled: false };

    if (sale.couponCode && Number(sale.couponDiscount) > 0) {
      const coupon = await tx.coupon.findUnique({
        where: { storeId_code: { storeId: sale.storeId, code: sale.couponCode } },
      });
      if (coupon?.usesCount > 0) {
        await tx.coupon.update({ where: { id: coupon.id }, data: { usesCount: { decrement: 1 } } });
      }
    }

    if (sale.paymentMethod === 'FIADO') {
      await tx.receivable.updateMany({
        where: { saleId },
        data: { status: 'CANCELLED', balance: 0 },
      });
    }

    for (const item of sale.items) {
      if (item.isService || !item.storeProductId) continue;
      await tx.storeProduct.update({
        where: { id: item.storeProductId },
        data: { stock: { increment: item.quantity } },
      });

      const breakdown = Array.isArray(item.batchBreakdown)
        ? item.batchBreakdown as unknown as BatchBreakdownEntry[]
        : [];
      if (breakdown.length > 0) {
        for (const entry of breakdown) {
          const quantity = Number(entry.qty ?? entry.quantity ?? 0);
          if (!entry.batchNumber || quantity <= 0) continue;
          const batch = await tx.productBatch.findFirst({
            where: {
              storeId: sale.storeId,
              storeProductId: item.storeProductId,
              batchNumber: entry.batchNumber,
            },
            orderBy: { expiryDate: 'asc' },
          });
          if (!batch) {
            throw new Error(`No se encontro el lote ${entry.batchNumber}; la venta no fue revertida`);
          }
          if (batch) {
            await tx.productBatch.update({
              where: { id: batch.id },
              data: { quantityAvailable: { increment: quantity }, active: true },
            });
            await tx.movement.create({
              data: {
                storeId: sale.storeId,
                storeProductId: item.storeProductId,
                batchId: batch.id,
                type: 'ADJUSTMENT',
                quantity,
                notes: `Anulación ticket #${sale.saleNumber}: ${reason}`,
                createdById: actorUserId,
              },
            });
          }
        }
      } else {
        await tx.movement.create({
          data: {
            storeId: sale.storeId,
            storeProductId: item.storeProductId,
            type: 'ADJUSTMENT',
            quantity: item.quantity,
            notes: `Anulación ticket #${sale.saleNumber}: ${reason}`,
            createdById: actorUserId,
          },
        });
      }
    }

    return { cancelled: true };
  });
}
