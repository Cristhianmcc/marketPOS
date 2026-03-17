import { prisma } from '@/infra/db/prisma';
import type { CatalogStatus } from '@prisma/client';
import type {
  CatalogProductProjection,
  CatalogSettings,
  UpdateCatalogSettingsInput,
  UpdateProductCatalogFieldsInput,
} from '../domain/catalog.types';

export class CatalogRepository {
  // Obtiene la configuración del catálogo de una tienda
  async getSettings(storeId: string): Promise<CatalogSettings | null> {
    return prisma.catalogSettings.findUnique({
      where: { storeId },
    });
  }

  // Crea la configuración si no existe (upsert seguro)
  async ensureSettings(storeId: string): Promise<CatalogSettings> {
    return prisma.catalogSettings.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: false,
        storeName: '',
        whatsappNumber: '',
        catalogStatus: 'DRAFT',
        syncMode: 'manual',
      },
      update: {}, // no sobreescribe si ya existe
    });
  }

  // Actualiza configuración del catálogo
  async updateSettings(
    storeId: string,
    input: UpdateCatalogSettingsInput
  ): Promise<CatalogSettings> {
    return prisma.catalogSettings.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: input.enabled ?? false,
        storeName: input.storeName ?? '',
        storeSlug: input.storeSlug ?? null,
        storeLogoPath: input.storeLogoPath ?? null,
        storeBannerPath: input.storeBannerPath ?? null,
        whatsappNumber: input.whatsappNumber ?? '',
        catalogStatus: (input.catalogStatus as CatalogStatus) ?? 'DRAFT',
        catalogUrl: input.catalogUrl ?? null,
        lastPublishedAt: input.lastPublishedAt ?? null,
        lastSyncAt: input.lastSyncAt ?? null,
        syncMode: input.syncMode ?? 'manual',
      },
      update: {
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.storeName !== undefined && { storeName: input.storeName }),
        ...(input.storeSlug !== undefined && { storeSlug: input.storeSlug }),
        ...(input.storeLogoPath !== undefined && { storeLogoPath: input.storeLogoPath }),
        ...(input.storeBannerPath !== undefined && { storeBannerPath: input.storeBannerPath }),
        ...(input.whatsappNumber !== undefined && { whatsappNumber: input.whatsappNumber }),
        ...(input.catalogStatus !== undefined && { catalogStatus: input.catalogStatus as CatalogStatus }),
        ...(input.catalogUrl !== undefined && { catalogUrl: input.catalogUrl }),
        ...(input.lastPublishedAt !== undefined && { lastPublishedAt: input.lastPublishedAt }),
        ...(input.lastSyncAt !== undefined && { lastSyncAt: input.lastSyncAt }),
        ...(input.syncMode !== undefined && { syncMode: input.syncMode }),
      },
    });
  }

  // Productos de la tienda marcados para catálogo (todos)
  async getCatalogProducts(storeId: string): Promise<CatalogProductProjection[]> {
    const rows = await prisma.storeProduct.findMany({
      where: { storeId, publishInCatalog: true },
      select: {
        id: true,
        price: true,
        publishInCatalog: true,
        catalogTitle: true,
        catalogDescription: true,
        catalogImagePath: true,
        catalogCategory: true,
        catalogVisible: true,
        catalogUpdatedAt: true,
        product: { select: { name: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.product.name,
      price: Number(r.price),
      publishInCatalog: r.publishInCatalog,
      catalogTitle: r.catalogTitle,
      catalogDescription: r.catalogDescription,
      catalogImagePath: r.catalogImagePath,
      catalogCategory: r.catalogCategory,
      catalogVisible: r.catalogVisible,
      catalogUpdatedAt: r.catalogUpdatedAt,
    }));
  }

  // Solo los visibles (para publicar)
  async getCatalogVisibleProducts(storeId: string): Promise<CatalogProductProjection[]> {
    const rows = await prisma.storeProduct.findMany({
      where: { storeId, publishInCatalog: true, catalogVisible: true },
      select: {
        id: true,
        price: true,
        publishInCatalog: true,
        catalogTitle: true,
        catalogDescription: true,
        catalogImagePath: true,
        catalogCategory: true,
        catalogVisible: true,
        catalogUpdatedAt: true,
        product: { select: { name: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.product.name,
      price: Number(r.price),
      publishInCatalog: r.publishInCatalog,
      catalogTitle: r.catalogTitle,
      catalogDescription: r.catalogDescription,
      catalogImagePath: r.catalogImagePath,
      catalogCategory: r.catalogCategory,
      catalogVisible: r.catalogVisible,
      catalogUpdatedAt: r.catalogUpdatedAt,
    }));
  }

  // Un StoreProduct específico para operaciones de catálogo
  async getProductCatalogProjection(
    storeProductId: string,
    storeId: string
  ): Promise<CatalogProductProjection | null> {
    const r = await prisma.storeProduct.findFirst({
      where: { id: storeProductId, storeId },
      select: {
        id: true,
        price: true,
        publishInCatalog: true,
        catalogTitle: true,
        catalogDescription: true,
        catalogImagePath: true,
        catalogCategory: true,
        catalogVisible: true,
        catalogUpdatedAt: true,
        product: { select: { name: true } },
      },
    });

    if (!r) return null;

    return {
      id: r.id,
      name: r.product.name,
      price: Number(r.price),
      publishInCatalog: r.publishInCatalog,
      catalogTitle: r.catalogTitle,
      catalogDescription: r.catalogDescription,
      catalogImagePath: r.catalogImagePath,
      catalogCategory: r.catalogCategory,
      catalogVisible: r.catalogVisible,
      catalogUpdatedAt: r.catalogUpdatedAt,
    };
  }

  // Actualiza campos de catálogo en un StoreProduct
  async updateProductCatalogFields(
    storeId: string,
    input: UpdateProductCatalogFieldsInput
  ): Promise<void> {
    await prisma.storeProduct.updateMany({
      where: { id: input.storeProductId, storeId },
      data: {
        ...(input.publishInCatalog !== undefined && { publishInCatalog: input.publishInCatalog }),
        ...(input.catalogTitle !== undefined && { catalogTitle: input.catalogTitle }),
        ...(input.catalogDescription !== undefined && { catalogDescription: input.catalogDescription }),
        ...(input.catalogImagePath !== undefined && { catalogImagePath: input.catalogImagePath }),
        ...(input.catalogCategory !== undefined && { catalogCategory: input.catalogCategory }),
        ...(input.catalogVisible !== undefined && { catalogVisible: input.catalogVisible }),
        catalogUpdatedAt: new Date(),
      },
    });
  }
}
