export const CATALOG_SETTINGS_ID = 'main' as const;

export const CatalogStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  SYNC_PENDING: 'SYNC_PENDING',
  SYNC_ERROR: 'SYNC_ERROR',
  DISABLED: 'DISABLED',
} as const;

export const CatalogSyncStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  ERROR: 'ERROR',
} as const;

export const CatalogEntityType = {
  CATALOG_SETTINGS: 'catalog_settings',
  PRODUCT: 'product',
  PRODUCT_IMAGE: 'product_image',
  CATALOG_PUBLISH: 'catalog_publish',
  CATALOG_UNPUBLISH: 'catalog_unpublish',
} as const;

export const CatalogAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  PUBLISH: 'PUBLISH',
  UNPUBLISH: 'UNPUBLISH',
} as const;

export type CatalogStatusValue = (typeof CatalogStatus)[keyof typeof CatalogStatus];
export type CatalogSyncStatusValue = (typeof CatalogSyncStatus)[keyof typeof CatalogSyncStatus];
export type CatalogEntityTypeValue = (typeof CatalogEntityType)[keyof typeof CatalogEntityType];
export type CatalogActionValue = (typeof CatalogAction)[keyof typeof CatalogAction];
