/**
 * Subida de imágenes del catálogo web desde el escritorio.
 *
 * El instalador no lleva claves de Cloudinary ni la clave compartida del
 * catálogo. Si la PC tiene Cloudinary configurado se sube directo; si no, la
 * imagen va a la nube (`/api/catalog/cloud-image`), que la sube con sus propias
 * claves. La nube identifica a la tienda con su token de licencia.
 */
import { v2 as cloudinary } from 'cloudinary';
import { getStoreLicenseCredential } from '@/lib/licenseCredentialStore';

export type CatalogImageKind = 'product' | 'logo' | 'banner';

const cloudUrl = () => (process.env.CLOUD_URL || '').replace(/\/+$/, '');

/** Valor de entorno sin espacios ni comillas sobrantes (errores comunes al pegar en Render). */
export function cleanEnv(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^["']|["']$/g, '').trim();
}

export function hasLocalCloudinary(): boolean {
  return Boolean(cleanEnv('CLOUDINARY_CLOUD_NAME') && cleanEnv('CLOUDINARY_API_KEY') && cleanEnv('CLOUDINARY_API_SECRET'));
}

/** Cabeceras para llamar a la nube en nombre de la tienda. */
export async function catalogCloudHeaders(storeId: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.CATALOG_API_KEY?.trim();
  if (apiKey) headers['x-api-key'] = apiKey;
  const token = await getStoreLicenseCredential(storeId);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Se puede subir si hay Cloudinary local o nube con licencia registrada. */
export async function canUploadCatalogImages(storeId: string): Promise<boolean> {
  if (hasLocalCloudinary()) return true;
  return Boolean(cloudUrl() && (await getStoreLicenseCredential(storeId)));
}

/** Transformación de Cloudinary según el uso de la imagen. */
export function catalogImageTransformation(kind: CatalogImageKind, mimeType: string) {
  if (kind === 'logo') return [{ width: 600, height: 600, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }];
  if (kind === 'banner') {
    return mimeType === 'image/gif' ? [] : [{ width: 1800, height: 900, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }];
  }
  return [{ width: 800, height: 800, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }];
}

/** Sube a Cloudinary con las claves de este servidor y devuelve la URL segura. */
export async function uploadToCloudinary(input: { buffer: Buffer; folder: string; kind: CatalogImageKind; mimeType: string; publicId?: string }): Promise<string> {
  cloudinary.config({
    cloud_name: cleanEnv('CLOUDINARY_CLOUD_NAME'),
    api_key: cleanEnv('CLOUDINARY_API_KEY'),
    api_secret: cleanEnv('CLOUDINARY_API_SECRET'),
  });
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: input.folder,
        ...(input.publicId && { public_id: input.publicId, overwrite: true }),
        transformation: catalogImageTransformation(input.kind, input.mimeType),
      },
      (error, result) => {
        if (error || !result) reject(error ?? new Error('Cloudinary no devolvió resultado'));
        else resolve(result.secure_url);
      },
    );
    stream.end(input.buffer);
  });
}

/** Sube una imagen del catálogo y devuelve su URL pública. */
export async function uploadCatalogImage(input: {
  storeId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  kind: CatalogImageKind;
}): Promise<string> {
  if (hasLocalCloudinary()) {
    const base = cleanEnv('CLOUDINARY_FOLDER') || 'market-pos';
    return uploadToCloudinary({
      buffer: input.buffer,
      folder: input.kind === 'product' ? (cleanEnv('CLOUDINARY_FOLDER') || 'market-pos-products') : `${base}-catalog`,
      kind: input.kind,
      mimeType: input.mimeType,
      publicId: input.kind === 'product' ? undefined : `${input.kind}-${input.storeId}-${Date.now()}`,
    });
  }
  if (!cloudUrl()) throw new Error('No hay conexión configurada con la nube para subir imágenes');
  const headers = await catalogCloudHeaders(input.storeId);
  if (!headers.Authorization && !headers['x-api-key']) {
    throw new Error('La tienda no tiene licencia registrada en la nube; no se pueden subir imágenes');
  }
  const res = await fetch(`${cloudUrl()}/api/catalog/cloud-image`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      storeId: input.storeId,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      dataBase64: input.buffer.toString('base64'),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.url !== 'string') {
    throw new Error(data.error || `La nube respondió ${res.status} al subir la imagen`);
  }
  return data.url;
}
