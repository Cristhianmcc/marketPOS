import { prisma } from '@/infra/db/prisma';
import type {
  CatalogPublishInput,
  CatalogPublishResult,
  CatalogUnpublishInput,
  PublicCatalogResponse,
} from '../domain/catalog-server.types';
import { CatalogMediaService } from '../services/catalog-media.service';
import { CatalogProductRepository } from '../infrastructure/catalog-product.repository';
import { CatalogStoreRepository } from '../infrastructure/catalog-store.repository';
import { CatalogPublishService } from '../services/catalog-publish.service';
import { CatalogUnpublishService } from '../services/catalog-unpublish.service';

export class CatalogController {
  constructor(
    private readonly mediaService: CatalogMediaService,
    private readonly publicCatalogBaseUrl: string,
  ) {}

  async publish(input: CatalogPublishInput): Promise<CatalogPublishResult> {
    const service = new CatalogPublishService(this.publicCatalogBaseUrl);
    const result = await service.execute(input);

    return {
      success: true,
      catalogUrl: result.catalogUrl,
      message: 'Catalogo publicado correctamente.',
    };
  }

  async unpublish(input: CatalogUnpublishInput): Promise<{ success: boolean; message: string }> {
    const service = new CatalogUnpublishService();
    await service.execute(input.storeId);

    return {
      success: true,
      message: 'Catalogo despublicado correctamente.',
    };
  }

  async uploadMedia(input: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  }): Promise<{ success: boolean; fileUrl: string; message: string }> {
    const result = await this.mediaService.saveBuffer({
      buffer: input.buffer,
      mimeType: input.mimeType,
      originalName: input.fileName,
    });

    return {
      success: true,
      fileUrl: result.fileUrl,
      message: 'Archivo subido correctamente.',
    };
  }

  async getPublicCatalogBySlug(slug: string): Promise<PublicCatalogResponse> {
    const storeRepository = new CatalogStoreRepository(prisma);
    const productRepository = new CatalogProductRepository(prisma);

    console.log(`[CatalogController] Buscando catálogo con slug: ${slug}`);

    const store = await storeRepository.getPublishedBySlug(slug);

    console.log(`[CatalogController] Store encontrada:`, store);

    if (!store || !store.storeSlug) {
      throw new Error(`Catálogo no encontrado para slug: ${slug}`);
    }

    const products = await productRepository.getVisibleBySlug(slug);

    console.log(`[CatalogController] Productos encontrados: ${products.length}`);

    return {
      success: true,
      store: {
        id: store.storeId,
        name: store.storeName,
        slug: store.storeSlug,
        whatsappNumber: store.whatsappNumber,
        logoUrl: store.storeLogoPath,
        bannerUrl: store.storeBannerPath,
        catalogUrl: store.catalogUrl,
        facebookUrl:
          'facebookUrl' in store ? ((store as unknown as { facebookUrl?: string | null }).facebookUrl ?? null) : null,
        instagramUrl:
          'instagramUrl' in store ? ((store as unknown as { instagramUrl?: string | null }).instagramUrl ?? null) : null,
        tiktokUrl:
          'tiktokUrl' in store ? ((store as unknown as { tiktokUrl?: string | null }).tiktokUrl ?? null) : null,
        updatedAt: store.updatedAt.toISOString(),
      },
      products: products.map((product) => ({
        id: product.id,
        localProductId: product.id,
        name: product.catalogTitle ?? product.product.name,
        description: product.catalogDescription,
        price: Number(product.price),
        category: product.catalogCategory ?? 'General',
        imageUrl: product.catalogImagePath,
        visible: product.catalogVisible,
        updatedAt: product.catalogUpdatedAt?.toISOString() ?? null,
      })),
    };
  }
}
