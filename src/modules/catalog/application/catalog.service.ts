import { CatalogRepository } from '../infrastructure/catalog.repository';
import { CatalogSyncRepository } from '../infrastructure/catalog-sync.repository';
import type {
  CatalogSettings,
  CatalogProductProjection,
  UpdateCatalogSettingsInput,
  UpdateProductCatalogFieldsInput,
  CatalogValidationResult,
  PublishableCatalogProduct,
} from '../domain/catalog.types';

export class CatalogService {
  constructor(
    private readonly catalogRepo: CatalogRepository,
    private readonly syncRepo: CatalogSyncRepository,
  ) {}

  // Inicializa la configuración de catálogo para la tienda (crea si no existe)
  async initialize(storeId: string): Promise<CatalogSettings> {
    return this.catalogRepo.ensureSettings(storeId);
  }

  async getSettings(storeId: string): Promise<CatalogSettings | null> {
    return this.catalogRepo.getSettings(storeId);
  }

  async updateSettings(
    storeId: string,
    input: UpdateCatalogSettingsInput,
  ): Promise<CatalogSettings> {
    return this.catalogRepo.updateSettings(storeId, input);
  }

  async enableCatalog(storeId: string): Promise<CatalogSettings> {
    return this.catalogRepo.updateSettings(storeId, { enabled: true });
  }

  async disableCatalog(storeId: string): Promise<CatalogSettings> {
    return this.catalogRepo.updateSettings(storeId, {
      enabled: false,
      catalogStatus: 'DISABLED',
    });
  }

  async updateProductCatalogFields(
    storeId: string,
    input: UpdateProductCatalogFieldsInput,
  ): Promise<void> {
    await this.catalogRepo.updateProductCatalogFields(storeId, input);
  }

  // Lista todos los productos habilitados y visibles para publicar
  async getPublishableProducts(storeId: string): Promise<PublishableCatalogProduct[]> {
    const products = await this.catalogRepo.getCatalogVisibleProducts(storeId);
    return products.map((p: CatalogProductProjection) => ({
      storeProductId: p.id,
      name: p.catalogTitle ?? p.name,
      description: p.catalogDescription ?? '',
      price: p.price,
      category: p.catalogCategory ?? '',
      imagePath: p.catalogImagePath,
      visible: p.catalogVisible,
      updatedAt: p.catalogUpdatedAt,
    }));
  }

  async validateCatalogBeforePublish(storeId: string): Promise<CatalogValidationResult> {
    const errors: string[] = [];

    const settings = await this.catalogRepo.getSettings(storeId);
    if (!settings) {
      errors.push('La configuración del catálogo no existe.');
      return { valid: false, errors };
    }
    if (!settings.enabled) {
      errors.push('El catálogo está deshabilitado.');
    }
    if (!settings.storeName?.trim()) {
      errors.push('El nombre de la tienda es requerido.');
    }
    if (!settings.storeSlug?.trim()) {
      errors.push('El slug de la tienda es requerido.');
    }
    if (!settings.whatsappNumber?.trim()) {
      errors.push('El número de WhatsApp es requerido.');
    }

    const products = await this.catalogRepo.getCatalogVisibleProducts(storeId);
    if (products.length === 0) {
      errors.push('No hay productos visibles en el catálogo para publicar.');
    }

    return { valid: errors.length === 0, errors };
  }

  // Marca que se solicitó publicar (encola para sincronización)
  async markPublishRequested(storeId: string): Promise<void> {
    await this.catalogRepo.updateSettings(storeId, {
      catalogStatus: 'SYNC_PENDING',
    });
    await this.syncRepo.enqueue({
      storeId,
      entityType: 'CATALOG_PUBLISH',
      entityId: storeId,
      action: 'PUBLISH',
      payload: {},
    });
  }
}
