export const CATALOG_BACKEND_ROUTES = {
  health: '/api/health',
  publicBySlug: '/api/catalog/public/:slug',
  publish: '/api/catalog/publish',
  unpublish: '/api/catalog/unpublish',
  mediaUpload: '/api/catalog/media/upload',
} as const;
