import type { Prisma, PrismaClient } from '@prisma/client';

type DBClient = PrismaClient | Prisma.TransactionClient;

export class CatalogPublicationRepository {
  constructor(private readonly db: DBClient) {}

  async create(input: {
    storeId: string;
    publicationType: 'publish' | 'unpublish';
    status: 'success' | 'error';
    message?: string | null;
  }): Promise<void> {
    await this.db.catalogSyncQueue.create({
      data: {
        storeId: input.storeId,
        entityType:
          input.publicationType === 'publish' ? 'CATALOG_PUBLISH' : 'CATALOG_UNPUBLISH',
        entityId: input.storeId,
        action: input.publicationType === 'publish' ? 'PUBLISH' : 'UNPUBLISH',
        payload: {
          status: input.status,
          message: input.message ?? null,
          source: 'catalog-backend',
        },
        status: input.status === 'success' ? 'DONE' : 'ERROR',
        retryCount: 0,
        errorMessage: input.status === 'error' ? input.message ?? 'Error de publicación' : null,
      },
    });
  }
}
