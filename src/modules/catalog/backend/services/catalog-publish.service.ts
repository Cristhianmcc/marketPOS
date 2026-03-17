import { prisma } from '@/infra/db/prisma';
import { CatalogProductRepository } from '../infrastructure/catalog-product.repository';
import { CatalogPublicationRepository } from '../infrastructure/catalog-publication.repository';
import { CatalogStoreRepository } from '../infrastructure/catalog-store.repository';
import type { CatalogPublishInput } from '../domain/catalog-server.types';

export class CatalogPublishService {
  constructor(private readonly publicCatalogBaseUrl: string) {}

  async execute(input: CatalogPublishInput): Promise<{ catalogUrl: string }> {
    this.validate(input);

    const catalogUrl = `${this.publicCatalogBaseUrl.replace(/\/+$/, '')}/c/${input.slug}`;

    await prisma.$transaction(async (tx) => {
      const storeRepository = new CatalogStoreRepository(tx);
      const productRepository = new CatalogProductRepository(tx);
      const publicationRepository = new CatalogPublicationRepository(tx);

      await storeRepository.upsertPublished({
        storeId: input.storeId,
        storeName: input.storeName,
        slug: input.slug,
        whatsappNumber: input.whatsappNumber,
        logoUrl: input.logoUrl,
        bannerUrl: input.bannerUrl,
        catalogUrl,
      });

      await productRepository.replaceStoreProducts(input.storeId, input.products);

      await publicationRepository.create({
        storeId: input.storeId,
        publicationType: 'publish',
        status: 'success',
        message: `Catalogo publicado con ${input.products.length} productos.`,
      });
    });

    return { catalogUrl };
  }

  private validate(input: CatalogPublishInput): void {
    if (!input.storeId?.trim()) throw new Error('storeId es obligatorio.');
    if (!input.storeName?.trim()) throw new Error('storeName es obligatorio.');
    if (!input.slug?.trim()) throw new Error('slug es obligatorio.');
    if (!input.whatsappNumber?.trim()) throw new Error('whatsappNumber es obligatorio.');
    if (!Array.isArray(input.products) || input.products.length === 0) {
      throw new Error('El catalogo debe tener al menos un producto.');
    }
  }
}
