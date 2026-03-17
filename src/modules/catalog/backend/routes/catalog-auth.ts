import type { NextRequest } from 'next/server';

export function isCatalogApiAuthorized(req: NextRequest): boolean {
  const expectedApiKey = process.env.CATALOG_API_KEY?.trim();
  if (!expectedApiKey) {
    // Si no se configura API key, el backend permite llamadas internas.
    return true;
  }

  const provided = req.headers.get('x-api-key')?.trim();
  return provided === expectedApiKey;
}
