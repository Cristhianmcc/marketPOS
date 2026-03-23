import type { PublicCatalogResponse } from '@/types/catalog';

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, '');
}

function getCatalogApiBaseUrl(): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_CATALOG_API_BASE_URL ||
    process.env.CATALOG_API_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';

  return normalizeBaseUrl(base);
}

export async function getPublicCatalogBySlug(
  slug: string,
  baseUrl?: string,
): Promise<PublicCatalogResponse> {
  const origin = baseUrl ? normalizeBaseUrl(baseUrl) : getCatalogApiBaseUrl();

  const response = await fetch(
    `${origin}/api/catalog/public/${encodeURIComponent(slug)}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    const error = new Error(data?.message || 'No se pudo cargar el catalogo.') as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return data as PublicCatalogResponse;
}
