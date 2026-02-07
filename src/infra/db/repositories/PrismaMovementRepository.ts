import { Movement } from '@/domain/types';
import { IMovementRepository } from '@/repositories/IMovementRepository';
import { prisma } from '../prisma';

export class PrismaMovementRepository implements IMovementRepository {
  async create(movement: Omit<Movement, 'id' | 'createdAt'>): Promise<Movement> {
    const created = await prisma.movement.create({
      data: {
        storeId: movement.storeId,
        storeProductId: movement.storeProductId,
        type: movement.type,
        quantity: movement.quantity,
        unitPrice: movement.unitPrice,
        total: movement.total,
        notes: movement.notes,
        createdById: movement.createdById,
      },
    });

    return {
      id: created.id,
      storeId: created.storeId,
      storeProductId: created.storeProductId,
      type: created.type as Movement['type'],
      quantity: created.quantity.toNumber(),
      unitPrice: created.unitPrice?.toNumber() || null,
      total: created.total?.toNumber() || null,
      notes: created.notes,
      createdById: created.createdById,
      createdAt: created.createdAt,
    };
  }

  async findByStoreProductId(storeProductId: string, limit = 50): Promise<Movement[]> {
    const movements = await prisma.movement.findMany({
      where: { storeProductId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return movements.map((m: any) => ({
      id: m.id,
      storeId: m.storeId,
      storeProductId: m.storeProductId,
      type: m.type as Movement['type'],
      quantity: m.quantity.toNumber(),
      unitPrice: m.unitPrice?.toNumber() || null,
      total: m.total?.toNumber() || null,
      notes: m.notes,
      createdById: m.createdById,
      createdAt: m.createdAt,
    }));
  }

  async findByStoreId(storeId: string, limit = 100): Promise<Movement[]> {
    const movements = await prisma.movement.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return movements.map((m: any) => ({
      id: m.id,
      storeId: m.storeId,
      storeProductId: m.storeProductId,
      type: m.type as Movement['type'],
      quantity: m.quantity.toNumber(),
      unitPrice: m.unitPrice?.toNumber() || null,
      total: m.total?.toNumber() || null,
      notes: m.notes,
      createdById: m.createdById,
      createdAt: m.createdAt,
    }));
  }
}
