/**
 * POST /api/catalog/cloud-image (nube)
 *
 * Recibe una imagen del catálogo desde el escritorio y la sube a Cloudinary
 * con las claves de este servidor. El escritorio no necesita claves propias.
 * Body: { storeId, kind: 'product'|'logo'|'banner', fileName, mimeType, dataBase64 }
 */
import { NextRequest, NextResponse } from 'next/server';
import { isCatalogStoreAuthorized } from '@/modules/catalog/backend/routes/catalog-auth';
import { cleanEnv, hasLocalCloudinary, uploadToCloudinary, type CatalogImageKind } from '@/lib/catalog/catalogImageUpload';

export const runtime = 'nodejs';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES: Record<CatalogImageKind, number> = { product: 5 * 1024 * 1024, logo: 2 * 1024 * 1024, banner: 8 * 1024 * 1024 };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const storeId = typeof body?.storeId === 'string' ? body.storeId : '';
    const kind = body?.kind as CatalogImageKind;
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.toLowerCase() : '';

    if (!storeId || !isCatalogStoreAuthorized(req, storeId)) {
      return NextResponse.json({ error: 'Tienda no autorizada para subir imágenes' }, { status: 401 });
    }
    if (!['product', 'logo', 'banner'].includes(kind)) {
      return NextResponse.json({ error: 'Tipo de imagen inválido' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: 'Formato no permitido. Usa PNG, JPG, WebP o GIF' }, { status: 400 });
    }
    if (!hasLocalCloudinary()) {
      return NextResponse.json({ error: 'El servidor web no tiene Cloudinary configurado' }, { status: 503 });
    }

    const buffer = Buffer.from(typeof body?.dataBase64 === 'string' ? body.dataBase64 : '', 'base64');
    if (buffer.length === 0) return NextResponse.json({ error: 'Imagen vacía' }, { status: 400 });
    if (buffer.length > MAX_BYTES[kind]) {
      return NextResponse.json({ error: `La imagen supera ${MAX_BYTES[kind] / 1024 / 1024} MB` }, { status: 400 });
    }

    const base = cleanEnv('CLOUDINARY_FOLDER') || 'market-pos';
    const url = await uploadToCloudinary({
      buffer,
      folder: `${base}-catalog/${storeId}`,
      kind,
      mimeType,
      publicId: kind === 'product' ? undefined : `${kind}-${Date.now()}`,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('[catalog/cloud-image] Error:', error);
    // El mensaje de Cloudinary (p. ej. "Invalid Signature", "Invalid api_key") no incluye claves
    const detail = (error as { message?: string; error?: { message?: string } })?.message
      ?? (error as { error?: { message?: string } })?.error?.message;
    return NextResponse.json(
      { error: detail ? `Cloudinary rechazó la imagen: ${String(detail).slice(0, 200)}` : 'No se pudo subir la imagen' },
      { status: 500 },
    );
  }
}
