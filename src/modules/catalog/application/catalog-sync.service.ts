import { CatalogRepository } from '../infrastructure/catalog.repository';
import { CatalogSyncRepository } from '../infrastructure/catalog-sync.repository';
import { CatalogApiClient } from '../infrastructure/catalog-api.client';
import type {
  CatalogPublishPayload,
  CatalogProductProjection,
} from '../domain/catalog.types';

export class CatalogSyncService {
  constructor(
    private readonly catalogRepo: CatalogRepository,
    private readonly syncRepo: CatalogSyncRepository,
    private readonly apiClient: CatalogApiClient,
  ) {}

  // Procesa items pendientes en la cola (hasta `limit` por llamada)
  async syncPendingQueue(storeId: string, limit = 50): Promise<void> {
    const pending = await this.syncRepo.getPending(storeId, limit);
    for (const item of pending) {
      await this.syncRepo.markProcessing(item.id);
      try {
        await this._processQueueItem(storeId, item.action);
        await this.syncRepo.markDone(item.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.syncRepo.markError(item.id, message);
      }
    }
  }

  // Publicación inmediata sin encolar (usa directamente la API)
  async syncPublishNow(storeId: string): Promise<string | null> {
    const settings = await this.catalogRepo.getSettings(storeId);
    if (!settings) throw new Error('Configuración de catálogo no encontrada.');
    if (!settings.storeSlug) throw new Error('El slug de la tienda es requerido.');

    const products = await this.catalogRepo.getCatalogVisibleProducts(storeId);

    const payload: CatalogPublishPayload = {
      storeId,
      storeName: settings.storeName,
      slug: settings.storeSlug,
      whatsappNumber: settings.whatsappNumber,
      logoUrl: settings.storeLogoPath ?? null,
      bannerUrl: settings.storeBannerPath ?? null,
      products: products.map((p) => this._projectionToPayload(p)),
    };

    const response = await this.apiClient.publishCatalog(payload);
    if (!response.success) {
      throw new Error(response.message ?? 'Error al publicar el catálogo.');
    }

    // Actualizar estado y URL en la configuración
    await this.catalogRepo.updateSettings(storeId, {
      catalogStatus: 'PUBLISHED',
      catalogUrl: response.catalogUrl,
      lastPublishedAt: new Date(),
      lastSyncAt: new Date(),
    });

    return response.catalogUrl;
  }

  // ----------------------------------------------------------------
  // Privados
  // ----------------------------------------------------------------

  private async _processQueueItem(
    storeId: string,
    action: string,
  ): Promise<void> {
    if (action === 'PUBLISH') {
      await this.syncPublishNow(storeId);
    } else if (action === 'UNPUBLISH') {
      await this.apiClient.unpublishCatalog(storeId);
      await this.catalogRepo.updateSettings(storeId, {
        catalogStatus: 'DRAFT',
        catalogUrl: null,
      });
    }
    // CREATE / UPDATE / DELETE de productos se resuelven via PUBLISH completo
  }

  private _projectionToPayload(p: CatalogProductProjection) {
    return {
      localProductId: p.id,
      name: p.catalogTitle ?? p.name,
      description: p.catalogDescription ?? '',
      price: p.price,
      category: p.catalogCategory ?? '',
      imageUrl: p.catalogImagePath,
      visible: p.catalogVisible,
      updatedAt: p.catalogUpdatedAt?.toISOString() ?? null,
    };
  }
}
