import { prisma } from '@/infra/db/prisma';
import type { CatalogSyncQueue, Prisma } from '@prisma/client';
import type { CreateCatalogSyncQueueItemInput } from '../domain/catalog.types';

export class CatalogSyncRepository {
  // Agrega un item a la cola
  async enqueue(input: CreateCatalogSyncQueueItemInput): Promise<void> {
    await prisma.catalogSyncQueue.create({
      data: {
        storeId: input.storeId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        payload: input.payload as Prisma.InputJsonValue,
        status: input.status ?? 'PENDING',
        retryCount: input.retryCount ?? 0,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  // Pendientes ordenados por fecha de creación
  async getPending(storeId: string, limit = 200): Promise<CatalogSyncQueue[]> {
    return prisma.catalogSyncQueue.findMany({
      where: { storeId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markProcessing(id: string): Promise<void> {
    await prisma.catalogSyncQueue.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });
  }

  async markDone(id: string): Promise<void> {
    await prisma.catalogSyncQueue.update({
      where: { id },
      data: { status: 'DONE', errorMessage: null },
    });
  }

  async markError(id: string, errorMessage: string): Promise<void> {
    await prisma.catalogSyncQueue.update({
      where: { id },
      data: {
        status: 'ERROR',
        retryCount: { increment: 1 },
        errorMessage,
      },
    });
  }

  // Reencola errores para reintentar
  async requeueErrors(storeId: string): Promise<void> {
    await prisma.catalogSyncQueue.updateMany({
      where: { storeId, status: 'ERROR' },
      data: { status: 'PENDING' },
    });
  }

  async countPending(storeId: string): Promise<number> {
    return prisma.catalogSyncQueue.count({
      where: { storeId, status: 'PENDING' },
    });
  }

  // Limpia items completados más antiguos de X días
  async purgeOldDone(storeId: string, olderThanDays = 7): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    await prisma.catalogSyncQueue.deleteMany({
      where: { storeId, status: 'DONE', updatedAt: { lt: cutoff } },
    });
  }
}
