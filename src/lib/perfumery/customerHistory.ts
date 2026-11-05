/**
 * Perfumería: historial de compras de perfume de un cliente en la sede.
 * Lo usan el checkout (habilitar rellenos) y el POS ("la última vez llevó…").
 */
import { Prisma } from '@prisma/client';
import { readPerfumeDetail } from './saleLine';

type Db = Pick<Prisma.TransactionClient, 'perfumePresentation' | 'saleItem'>;

/** Venta sin anular: la anulación local deja total y subtotal en 0. */
export const notCancelledSale: Prisma.SaleWhereInput = { NOT: { total: 0, subtotal: 0 } };

/** ¿El cliente compró (en una venta sin anular) una presentación que habilita rellenos? */
export async function hasRefillPurchase(db: Db, storeId: string, customerId: string): Promise<boolean> {
  const granting = await db.perfumePresentation.findMany({
    where: { storeId, grantsRefill: true },
    select: { id: true },
  });
  const prior = await db.saleItem.findFirst({
    where: {
      sale: { storeId, customerId, ...notCancelledSale },
      OR: [
        { perfumeDetail: { path: ['grantsRefill'], equals: true } },
        ...granting.map((p) => ({ perfumeDetail: { path: ['presentationId'], equals: p.id } })),
      ],
    },
    select: { id: true },
  });
  return Boolean(prior);
}

export interface PerfumePurchase {
  saleNumber: number;
  date: string;
  fragranceCode: string;
  essenceStoreProductId: string | null;
  presentationId: string;
  presentationName: string;
  bottles: number;
  packName: string | null;
}

/** Últimas líneas de perfume del cliente (más recientes primero). */
export async function recentPerfumePurchases(db: Db, storeId: string, customerId: string, take = 10): Promise<PerfumePurchase[]> {
  const items = await db.saleItem.findMany({
    where: { sale: { storeId, customerId, ...notCancelledSale }, NOT: { perfumeDetail: { equals: Prisma.AnyNull } } },
    select: {
      storeProductId: true,
      perfumeDetail: true,
      sale: { select: { saleNumber: true, createdAt: true } },
    },
    orderBy: { sale: { createdAt: 'desc' } },
    take,
  });
  return items.flatMap((item) => {
    const detail = readPerfumeDetail(item.perfumeDetail);
    if (!detail) return [];
    return [{
      saleNumber: item.sale.saleNumber,
      date: item.sale.createdAt.toISOString(),
      fragranceCode: detail.fragranceCode,
      essenceStoreProductId: item.storeProductId,
      presentationId: detail.presentationId,
      presentationName: detail.presentationName,
      bottles: detail.bottles,
      packName: detail.pack?.name ?? null,
    }];
  });
}
