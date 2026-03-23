import type { Prisma, PrismaClient } from '@prisma/client';
import type { CatalogPublishProductInput } from '../domain/catalog-server.types';

type DBClient = PrismaClient | Prisma.TransactionClient;

export class CatalogProductRepository {
  constructor(private readonly db: DBClient) {}

  async getVisibleBySlug(slug: string) {
    return this.db.storeProduct.findMany({
      where: {
        publishInCatalog: true,
        catalogVisible: true,
        store: {
          catalogSettings: {
            is: {
              storeSlug: slug,
              catalogStatus: 'PUBLISHED',
              enabled: true,
            },
          },
        },
      },
      select: {
        id: true,
        catalogTitle: true,
        catalogDescription: true,
        catalogCategory: true,
        catalogImagePath: true,
        catalogVisible: true,
        catalogUpdatedAt: true,
        price: true,
        product: { select: { name: true } },
      },
      orderBy: {
        catalogTitle: 'asc',
      },
    });
  }

  async replaceStoreProducts(
    storeId: string,
    products: CatalogPublishProductInput[],
  ): Promise<void> {
    const localIds = products.map((p) => p.localProductId);

    // Ocultar productos que no están en este publish
    await this.db.storeProduct.updateMany({
      where: {
        storeId,
        ...(localIds.length > 0 && { id: { notIn: localIds } }),
      },
      data: {
        publishInCatalog: false,
        catalogVisible: false,
        catalogUpdatedAt: new Date(),
      },
    });

    // Procesar en lotes de 200 para evitar timeout
    const BATCH_SIZE = 200;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(product => this.upsertProduct(storeId, product)));
    }
  }

  private async upsertProduct(storeId: string, product: CatalogPublishProductInput): Promise<void> {
      const updated = await this.db.storeProduct.updateMany({
        where: {
          id: product.localProductId,
          storeId,
        },
        data: {
          publishInCatalog: true,
          catalogTitle: product.name,
          catalogDescription: product.description || null,
          catalogCategory: product.category || null,
          catalogImagePath: product.imageUrl,
          catalogVisible: product.visible,
          catalogUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : new Date(),
          price: product.price,
        },
      });

      if (updated.count === 0) {
        // El producto no existe en la nube aún — crear ProductMaster + StoreProduct
        const catalogSku = `CATALOG-${product.localProductId}`;
        const pm = await this.db.productMaster.upsert({
          where: { internalSku: catalogSku },
          create: {
            internalSku: catalogSku,
            name: product.name,
            category: product.category || 'Otros',
            imageUrl: product.imageUrl || null,
            isGlobal: false,
            unitType: 'UNIT',
          },
          update: {
            name: product.name,
            category: product.category || 'Otros',
            imageUrl: product.imageUrl || null,
          },
        });
        await this.db.storeProduct.upsert({
          where: { storeId_productId: { storeId, productId: pm.id } },
          create: {
            id: product.localProductId,
            storeId,
            productId: pm.id,
            price: product.price,
            publishInCatalog: true,
            catalogTitle: product.name,
            catalogDescription: product.description || null,
            catalogCategory: product.category || null,
            catalogImagePath: product.imageUrl,
            catalogVisible: product.visible,
            catalogUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : new Date(),
          },
          update: {
            price: product.price,
            publishInCatalog: true,
            catalogTitle: product.name,
            catalogDescription: product.description || null,
            catalogCategory: product.category || null,
            catalogImagePath: product.imageUrl,
            catalogVisible: product.visible,
            catalogUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : new Date(),
          },
        });
      }
  }
}
