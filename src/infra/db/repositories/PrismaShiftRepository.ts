// Prisma implementation of IShiftRepository

import { Prisma } from '@prisma/client';
import { advancesByMethodForShift } from '@/lib/workOrders/payments';
import { prisma } from '@/infra/db/prisma';
import { IShiftRepository } from '@/repositories/IShiftRepository';
import { Shift, ShiftWithUsers, OpenShiftData, CloseShiftData } from '@/domain/types';

export class PrismaShiftRepository implements IShiftRepository {
  async getCurrentShift(storeId: string, userId: string): Promise<Shift | null> {
    const shift = await prisma.shift.findFirst({
      where: {
        storeId,
        openedById: userId,
        closedAt: null,
      },
      orderBy: { openedAt: 'desc' },
    });

    if (!shift) return null;

    return this.toDomain(shift);
  }

  async createIfNone(storeId: string, userId: string, data: OpenShiftData): Promise<Shift | null> {
    return prisma.$transaction(async (tx) => {
      // Serializa únicamente la apertura de este cajero en esta tienda. El lock
      // dura hasta el final de la transacción y evita el intervalo entre leer y crear.
      const lockKey = `shift-open:${storeId}:${userId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existingShift = await tx.shift.findFirst({
        where: {
          storeId,
          openedById: userId,
          closedAt: null,
        },
        orderBy: { openedAt: 'desc' },
      });

      if (existingShift) return null;

      const shift = await tx.shift.create({
        data: {
          storeId,
          openedById: userId,
          openingCash: new Prisma.Decimal(data.openingCash),
          openedAt: new Date(),
        },
      });

      return this.toDomain(shift);
    });
  }

  async findById(shiftId: string, storeId: string): Promise<Shift | null> {
    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        storeId,
      },
    });

    if (!shift) return null;

    return this.toDomain(shift);
  }

  async close(
    shiftId: string,
    closedById: string,
    data: CloseShiftData,
    expectedCash: number,
    difference: number
  ): Promise<Shift> {
    const shift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        closedById,
        closingCash: new Prisma.Decimal(data.closingCash),
        expectedCash: new Prisma.Decimal(expectedCash),
        difference: new Prisma.Decimal(difference),
        notes: data.notes || null,
      },
    });

    return this.toDomain(shift);
  }

  async getHistory(
    storeId: string,
    userId: string | null,
    from?: Date,
    to?: Date,
    page: number = 1,
    limit: number = 15,
    search?: string
  ): Promise<{ shifts: ShiftWithUsers[]; total: number }> {
    const where: Prisma.ShiftWhereInput = {
      storeId,
      closedAt: { not: null }, // Solo turnos cerrados en historial
    };

    // Si userId es proporcionado (CASHIER), filtrar por sus turnos
    if (userId) {
      where.openedById = userId;
    }

    // Filtros de fecha
    if (from || to) {
      where.openedAt = {};
      if (from) where.openedAt.gte = from;
      if (to) where.openedAt.lte = to;
    }

    // Búsqueda por nombre de cajero
    if (search) {
      where.openedBy = {
        name: { contains: search, mode: 'insensitive' },
      };
    }

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        include: {
          openedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          closedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shift.count({ where }),
    ]);

    return {
      shifts: shifts.map((s) => ({
        id: s.id,
        storeId: s.storeId,
        openedById: s.openedById,
        closedById: s.closedById,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openingCash: s.openingCash.toNumber(),
        closingCash: s.closingCash?.toNumber() ?? null,
        expectedCash: s.expectedCash?.toNumber() ?? null,
        difference: s.difference?.toNumber() ?? null,
        notes: s.notes,
        openedBy: s.openedBy,
        closedBy: s.closedBy,
      })),
      total,
    };
  }

  async hasOpenShift(storeId: string, userId: string): Promise<boolean> {
    // Cada cajero puede tener a lo sumo un turno abierto a la vez
    const count = await prisma.shift.count({
      where: {
        storeId,
        openedById: userId,
        closedAt: null,
      },
    });

    return count > 0;
  }

  async getCashSalesTotal(shiftId: string): Promise<number> {
    // 1. Ventas en CASH (excluir FIADO)
    const salesResult = await prisma.sale.aggregate({
      where: {
        shiftId,
        paymentMethod: 'CASH',
        total: { gt: 0 }, // Excluir ventas anuladas
      },
      _sum: {
        total: true,
        advanceApplied: true,
      },
    });

    // El adelanto de una orden ya entró a caja cuando se cobró (ver punto 4)
    const cashSalesTotal = (salesResult._sum.total?.toNumber() || 0) - (salesResult._sum.advanceApplied?.toNumber() || 0);

    // 2. Pagos de FIADO en CASH durante este turno
    const paymentsResult = await prisma.receivablePayment.aggregate({
      where: {
        shiftId,
        method: 'CASH',
      },
      _sum: {
        amount: true,
      },
    });

    const cashPaymentsTotal = paymentsResult._sum.amount?.toNumber() || 0;

    // 3. Porción CASH de ventas MIXED durante este turno
    let mixedCashTotal = 0;
    const mixedSales = await prisma.sale.findMany({
      where: {
        shiftId,
        paymentMethod: 'MIXED',
        total: { gt: 0 },
        paymentDetails: { not: Prisma.DbNull },
      },
      select: { paymentDetails: true },
    });
    for (const sale of mixedSales) {
      const details = sale.paymentDetails as any;
      if (details?.splits && Array.isArray(details.splits)) {
        for (const split of details.splits) {
          if (split.method === 'CASH' && typeof split.amount === 'number') {
            mixedCashTotal += split.amount;
          }
        }
      }
    }

    // 4. Adelantos de órdenes en CASH cobrados (menos devueltos) en este turno
    const advances = await advancesByMethodForShift(prisma, shiftId);
    const cashAdvancesTotal = advances.CASH?.total ?? 0;

    // Total = Ventas CASH (sin adelanto) + Pagos FIADO CASH + Porción CASH de MIXED + Adelantos CASH
    return Math.round((cashSalesTotal + cashPaymentsTotal + mixedCashTotal + cashAdvancesTotal) * 100) / 100;
  }

  async getSalesByMethod(shiftId: string): Promise<{ byMethod: Record<string, { total: number; count: number }>; mixedInfo: { count: number; total: number; details: string[]; splitTotals: Record<string, number> } }> {
    // 1. Agrupar ventas NO mixtas por método
    const groups = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: {
        shiftId,
        total: { gt: 0 },
        paymentMethod: { not: 'MIXED' },
      },
      _sum: { total: true, advanceApplied: true },
      _count: { _all: true },
    });

    // Lo cobrado por método: las ventas de órdenes descuentan el adelanto, que
    // se suma aparte en el turno y método en que se cobró.
    const result: Record<string, { total: number; count: number }> = {};
    for (const g of groups) {
      result[g.paymentMethod] = {
        total: Math.round(((g._sum.total?.toNumber() || 0) - (g._sum.advanceApplied?.toNumber() || 0)) * 100) / 100,
        count: g._count._all,
      };
    }
    for (const [method, advance] of Object.entries(await advancesByMethodForShift(prisma, shiftId))) {
      const entry = result[method] ?? { total: 0, count: 0 };
      entry.total = Math.round((entry.total + advance.total) * 100) / 100;
      entry.count += advance.count;
      result[method] = entry;
    }

    // 2. Desglosar ventas MIXED: sumar cada split al método correspondiente
    const mixedSales = await prisma.sale.findMany({
      where: {
        shiftId,
        paymentMethod: 'MIXED',
        total: { gt: 0 },
        paymentDetails: { not: Prisma.DbNull },
      },
      select: { paymentDetails: true, total: true },
    });

    let mixedTotal = 0;
    const mixedMethodCombos: string[] = [];
    const splitTotals: Record<string, number> = {};
    const methodLabel: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', CARD: 'Tarjeta' };

    for (const sale of mixedSales) {
      mixedTotal += sale.total.toNumber();
      const details = sale.paymentDetails as any;
      if (details?.splits && Array.isArray(details.splits)) {
        const combo = details.splits
          .filter((s: any) => s.amount > 0)
          .map((s: any) => methodLabel[s.method] || s.method)
          .join('/');
        if (combo) mixedMethodCombos.push(combo);

        for (const split of details.splits) {
          if (split.method && typeof split.amount === 'number' && split.amount > 0) {
            if (!result[split.method]) {
              result[split.method] = { total: 0, count: 0 };
            }
            result[split.method].total = Math.round((result[split.method].total + split.amount) * 100) / 100;
            result[split.method].count += 1;
            // Acumular totales de splits para mostrar desglose en Mixto
            const label = methodLabel[split.method] || split.method;
            splitTotals[label] = Math.round(((splitTotals[label] ?? 0) + split.amount) * 100) / 100;
          }
        }
      }
    }

    return {
      byMethod: result,
      mixedInfo: {
        count: mixedSales.length,
        total: Math.round(mixedTotal * 100) / 100,
        details: mixedMethodCombos,
        splitTotals,
      },
    };
  }

  async getShiftProfit(shiftId: string): Promise<{ totalSales: number; totalCost: number; profit: number }> {
    const result = await prisma.$queryRaw<Array<{ total_sales: any; total_cost: any }>>(
      Prisma.sql`
        SELECT 
          COALESCE(SUM(si.total_line), 0) as total_sales,
          COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.shift_id = ${shiftId}
          AND s.total > 0
      `
    );
    const totalSales = Number(result[0]?.total_sales || 0);
    const totalCost = Number(result[0]?.total_cost || 0);
    return { totalSales, totalCost, profit: totalSales - totalCost };
  }

  async getShiftProfitByProduct(shiftId: string): Promise<Array<{
    productName: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    totalCost: number;
    totalRevenue: number;
    profit: number;
  }>> {
    const rows = await prisma.$queryRaw<Array<{
      product_name: string;
      qty: any;
      unit_cost: any;
      unit_price: any;
      total_cost: any;
      total_revenue: any;
    }>>(
      Prisma.sql`
        SELECT 
          si.product_name as product_name,
          SUM(si.quantity) as qty,
          ROUND(AVG(si.cost_price), 2) as unit_cost,
          ROUND(AVG(si.unit_price), 2) as unit_price,
          COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
          COALESCE(SUM(si.total_line), 0) as total_revenue
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.shift_id = ${shiftId}
          AND s.total > 0
          AND si.cost_price IS NOT NULL
        GROUP BY si.product_name
        ORDER BY SUM(si.total_line) DESC
      `
    );
    return rows.map(r => ({
      productName: r.product_name,
      quantity: Number(r.qty),
      unitCost: Number(r.unit_cost),
      unitPrice: Number(r.unit_price),
      totalCost: Number(r.total_cost),
      totalRevenue: Number(r.total_revenue),
      profit: Number(r.total_revenue) - Number(r.total_cost),
    }));
  }

  private toDomain(shift: any): Shift {
    return {
      id: shift.id,
      storeId: shift.storeId,
      openedById: shift.openedById,
      closedById: shift.closedById,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openingCash: shift.openingCash.toNumber(),
      closingCash: shift.closingCash?.toNumber() ?? null,
      expectedCash: shift.expectedCash?.toNumber() ?? null,
      difference: shift.difference?.toNumber() ?? null,
      notes: shift.notes,
    };
  }
}
