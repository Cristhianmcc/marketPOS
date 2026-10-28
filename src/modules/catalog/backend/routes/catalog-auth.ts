import type { NextRequest } from 'next/server';
import { verifyStoreLicenseToken } from '@/lib/cloudLicenseTokens';

export function isCatalogApiAuthorized(req: NextRequest): boolean {
  const expectedApiKey = process.env.CATALOG_API_KEY?.trim();
  if (!expectedApiKey) {
    // Si no se configura API key, el backend permite llamadas internas.
    return true;
  }

  const provided = req.headers.get('x-api-key')?.trim();
  return provided === expectedApiKey;
}

/**
 * Autoriza una llamada del escritorio para una tienda concreta: con la clave
 * compartida del catálogo (si el servidor la tiene) o con el token de licencia
 * de esa misma tienda. Sin una de las dos se rechaza, para que nadie pueda
 * publicar el catálogo de otra tienda.
 */
export function isCatalogStoreAuthorized(req: NextRequest, storeId: string): boolean {
  const expectedApiKey = process.env.CATALOG_API_KEY?.trim();
  if (expectedApiKey && req.headers.get('x-api-key')?.trim() === expectedApiKey) return true;
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return Boolean(bearer && storeId && verifyStoreLicenseToken(bearer, storeId));
}
