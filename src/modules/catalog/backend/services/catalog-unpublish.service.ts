import { prisma } from '@/infra/db/prisma';
import { CatalogPublicationRepository } from '../infrastructure/catalog-publication.repository';
import { CatalogStoreRepository } from '../infrastructure/catalog-store.repository';

export class CatalogUnpublishService {
  async execute(storeId: string): Promise<void> {
    if (!storeId?.trim()) {
      throw new Error('storeId es obligatorio.');
    }

    await prisma.$transaction(async (tx) => {
      const storeRepository = new CatalogStoreRepository(tx);
      const publicationRepository = new CatalogPublicationRepository(tx);

      await storeRepository.setDisabled(storeId);

      await publicationRepository.create({
        storeId,
        publicationType: 'unpublish',
        status: 'success',
        message: 'Catalogo despublicado correctamente.',
      });
    });
  }
}
