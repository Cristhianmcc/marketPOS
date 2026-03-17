import type { CatalogSettings, CatalogSyncQueue } from '@prisma/client';

// Re-exportamos los tipos de Prisma para uso interno del módulo
export type { CatalogSettings, CatalogSyncQueue };

// Input para actualizar configuración del catálogo
export interface UpdateCatalogSettingsInput {
  enabled?: boolean;
  storeName?: string;
  storeSlug?: string | null;
  storeLogoPath?: string | null;
  storeBannerPath?: string | null;
  whatsappNumber?: string;
  catalogStatus?: import('@prisma/client').CatalogStatus;
  catalogUrl?: string | null;
  lastPublishedAt?: Date | null;
  lastSyncAt?: Date | null;
  syncMode?: string;
}

// Proyección de StoreProduct para el catálogo
export interface CatalogProductProjection {
  id: string;
  name: string;
  price: number;
  publishInCatalog: boolean;
  catalogTitle: string | null;
  catalogDescription: string | null;
  catalogImagePath: string | null;
  catalogCategory: string | null;
  catalogVisible: boolean;
  catalogUpdatedAt: Date | null;
}

// Input para actualizar campos de catálogo en un StoreProduct
export interface UpdateProductCatalogFieldsInput {
  storeProductId: string;
  publishInCatalog?: boolean;
  catalogTitle?: string | null;
  catalogDescription?: string | null;
  catalogImagePath?: string | null;
  catalogCategory?: string | null;
  catalogVisible?: boolean;
}

// Input para crear un item en la cola de sincronización
export interface CreateCatalogSyncQueueItemInput {
  storeId: string;
  entityType: import('@prisma/client').CatalogEntityType;
  entityId: string;
  action: import('@prisma/client').CatalogAction;
  payload: Record<string, unknown>;
  status?: import('@prisma/client').CatalogSyncStatus;
  retryCount?: number;
  errorMessage?: string | null;
}

// Resultado de validación antes de publicar
export interface CatalogValidationResult {
  valid: boolean;
  errors: string[];
}

// Producto listo para enviar al backend de catálogo
export interface PublishableCatalogProduct {
  storeProductId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imagePath: string | null;
  visible: boolean;
  updatedAt: Date | null;
}

// ---- Módulo 2: Payloads API ----

export interface CatalogPublishProductPayload {
  localProductId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string | null;
  visible: boolean;
  updatedAt: string | null;
}

export interface CatalogPublishPayload {
  storeId: string;
  storeName: string;
  slug: string;
  whatsappNumber: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  products: CatalogPublishProductPayload[];
}

export interface CatalogPublishResponse {
  success: boolean;
  catalogUrl: string | null;
  message?: string;
}

export interface CatalogUploadMediaResponse {
  success: boolean;
  fileUrl: string;
  message?: string;
}

export interface CatalogApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}
