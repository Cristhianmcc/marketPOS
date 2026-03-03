/**
 * catalogSync.ts
 *
 * Helper de sincronización de productos al catálogo cloud.
 * Se llama en segundo plano (fire-and-forget) desde las rutas
 * de creación y edición de productos.
 *
 * Si no hay internet o el cloud no está configurado → falla silenciosamente.
 * No bloquea nunca la respuesta al usuario.
 */

const CATALOG_CLOUD_URL  = process.env.CATALOG_CLOUD_URL  || '';
const CATALOG_SYNC_API_KEY = process.env.CATALOG_SYNC_API_KEY || '';

export interface CatalogProductPayload {
  name: string;
  brand?: string | null;
  content?: string | null;
  category?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  unitType?: 'UNIT' | 'KG';
  sourceStoreId?: string | null;
}

/**
 * Envía el producto al cloud catálogo en segundo plano.
 * Nunca lanza error — siempre resuelve.
 */
export function syncProductToCatalog(product: CatalogProductPayload): void {
  if (!CATALOG_CLOUD_URL || !CATALOG_SYNC_API_KEY) return;

  // Fire-and-forget: no await, no blocking
  void fetch(`${CATALOG_CLOUD_URL}/api/catalog/contribute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CATALOG_SYNC_API_KEY,
    },
    body: JSON.stringify(product),
    signal: AbortSignal.timeout(8_000),
  }).catch((err) => {
    // Silencioso: puede fallar por falta de internet
    console.warn('[catalogSync] No se pudo sincronizar producto al cloud:', err?.message ?? err);
  });
}
