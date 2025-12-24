// Prisma implementation of IShiftRepository

import { Prisma } from '@prisma/client';
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

  async create(storeId: string, userId: string, data: OpenShiftData): Promise<Shift> {
    const shift = await prisma.shift.create({
      data: {
        storeId,
        openedById: userId,
        openingCash: new Prisma.Decimal(data.openingCash),
        openedAt: new Date(),
      },
    });

    return this.toDomain(shift);
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
    to?: Date
  ): Promise<ShiftWithUsers[]> {
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

    const shifts = await prisma.shift.findMany({
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
    });

    return shifts.map((s) => ({
      id: s.id,
      storeId: s.storeId,
      openedById: s.openedById,
      closedById: s.closedById,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingCash: s.openingCash.toNumber(),
      closingCash: s.closingCash?.toNumber() || null,
      expectedCash: s.expectedCash?.toNumber() || null,
      difference: s.difference?.toNumber() || null,
      notes: s.notes,
      openedBy: s.openedBy,
      closedBy: s.closedBy,
    }));
  }

  async hasOpenShift(storeId: string, userId: string): Promise<boolean> {
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
      },
    });

    const cashSalesTotal = salesResult._sum.total?.toNumber() || 0;

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

    // Total = Ventas CASH + Pagos FIADO CASH
    return cashSalesTotal + cashPaymentsTotal;
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
      closingCash: shift.closingCash?.toNumber() || null,
      expectedCash: shift.expectedCash?.toNumber() || null,
      difference: shift.difference?.toNumber() || null,
      notes: shift.notes,
    };
  }
}
