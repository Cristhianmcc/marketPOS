/**
 * GET  /api/desktop/sync-catalog-images  → cuenta cuántas imágenes locales están pendientes
 * POST /api/desktop/sync-catalog-images  → sube las imágenes locales a Cloudinary y actualiza la BD
 *
 * Solo disponible en DESKTOP_MODE=true.
 * No toca el upload original de imágenes: sigue funcionando 100% offline.
 * Este endpoint se llama manualmente desde la página de Catálogo Web antes de publicar.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { canUploadCatalogImages, uploadCatalogImage } from '@/lib/catalog/catalogImageUpload';

export const runtime = 'nodejs';

const LOCAL_IMAGES_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
const INDEX_PATH = path.join(LOCAL_IMAGES_DIR, 'index.json');
const LOCAL_IMAGE_PREFIX = '/api/desktop/local-image/';

function isDesktopMode(): boolean {
  return process.env.DESKTOP_MODE === 'true';
}


function loadIndex(): Record<string, { filename: string; mime: string; createdAt: string }> {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
      return JSON.parse(raw) as Record<string, { filename: string; mime: string; createdAt: string }>;
    }
  } catch {
    // ignorar errores de lectura
  }
  return {};
}

const mimeOf = (filename: string, mime?: string) =>
  mime && mime.startsWith('image/') ? mime
    : filename.toLowerCase().endsWith('.png') ? 'image/png'
      : filename.toLowerCase().endsWith('.webp') ? 'image/webp'
        : filename.toLowerCase().endsWith('.gif') ? 'image/gif'
          : 'image/jpeg';

// ─── GET: contar imágenes pendientes ───────────────────────────────────────

export async function GET(_req: NextRequest) {
  if (!isDesktopMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await getSession();
  const uploadsAvailable = session?.storeId ? await canUploadCatalogImages(session.storeId) : false;

  try {
    // Contar StoreProducts con catalogImagePath local
    const pendingCatalog = await prisma.storeProduct.count({
      where: {
        catalogImagePath: { startsWith: LOCAL_IMAGE_PREFIX },
        publishInCatalog: true,
      },
    });

    // Contar productos con imageUrl local cuyo catalogImagePath aún no es URL cloud
    const pendingProducts = await prisma.storeProduct.count({
      where: {
        product: { imageUrl: { startsWith: LOCAL_IMAGE_PREFIX } },
        publishInCatalog: true,
        NOT: { catalogImagePath: { startsWith: 'http' } },
      },
    });

    return NextResponse.json({
      ok: true,
      pending: pendingCatalog + pendingProducts,
      pendingCatalogImages: pendingCatalog,
      pendingProductImages: pendingProducts,
      cloudinaryConfigured: uploadsAvailable,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Columnas de catálogo aún no existen en BD desktop antigua → no hay pendientes
    const isSchemaMismatch =
      msg.includes('publish_in_catalog') ||
      msg.includes('publishInCatalog') ||
      msg.includes('catalog_image_path') ||
      msg.includes('catalogImagePath') ||
      msg.includes('Unknown column') ||
      msg.includes('no such column') ||
      msg.includes('P2021') ||
      msg.includes('does not exist');
    if (isSchemaMismatch) {
      return NextResponse.json({
        ok: true,
        pending: 0,
        pendingCatalogImages: 0,
        pendingProductImages: 0,
        cloudinaryConfigured: uploadsAvailable,
        schemaOutdated: true,
      });
    }
    console.error('[sync-catalog-images GET] Error:', err);
    return NextResponse.json({ error: 'Error al contar imágenes pendientes' }, { status: 500 });
  }
}

// ─── POST: sincronizar imágenes locales → Cloudinary ──────────────────────

export async function POST(_req: NextRequest) {
  if (!isDesktopMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await getSession();
  if (!session?.storeId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const storeId = session.storeId;
  if (!(await canUploadCatalogImages(storeId))) {
    return NextResponse.json(
      { error: 'No se pueden subir imágenes: la tienda no tiene licencia registrada en la nube.' },
      { status: 503 },
    );
  }
  try {
    return await syncImages(storeId);
  } catch (error) {
    console.error('[sync-catalog-images POST] Error:', error);
    return NextResponse.json(
      { error: `No se pudieron sincronizar las imágenes: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}

async function syncImages(storeId: string) {
  const index = loadIndex();

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  // ── 1. Sincronizar catalogImagePath de StoreProduct ────────────────────
  const catalogProducts = await prisma.storeProduct.findMany({
    where: {
      catalogImagePath: { startsWith: LOCAL_IMAGE_PREFIX },
      publishInCatalog: true,
    },
    select: { id: true, catalogImagePath: true },
  });

  for (const sp of catalogProducts) {
    const localId = sp.catalogImagePath!.replace(LOCAL_IMAGE_PREFIX, '');
    const entry = index[localId];

    if (!entry) {
      failed++;
      errors.push(`catalogImagePath sin índice: ${localId}`);
      continue;
    }

    const filePath = path.join(LOCAL_IMAGES_DIR, entry.filename);
    if (!fs.existsSync(filePath)) {
      failed++;
      errors.push(`Archivo no encontrado: ${entry.filename}`);
      continue;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const cloudUrl = await uploadCatalogImage({ storeId, buffer, fileName: entry.filename, mimeType: mimeOf(entry.filename, entry.mime), kind: 'product' });

      await prisma.storeProduct.update({
        where: { id: sp.id },
        data: { catalogImagePath: cloudUrl },
      });

      // NO borrar archivo local — se necesita para mostrar offline en inventario
      synced++;
    } catch (err) {
      failed++;
      errors.push(`Error subiendo ${localId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 2. Productos con imageUrl local: subir a Cloudinary y guardar en catalogImagePath ─
  // NO tocamos productMaster.imageUrl — se mantiene local para funcionar offline
  const productsWithLocalImage = await prisma.storeProduct.findMany({
    where: {
      publishInCatalog: true,
      product: { imageUrl: { startsWith: LOCAL_IMAGE_PREFIX } },
    },
    select: {
      id: true,
      catalogImagePath: true,
      product: { select: { id: true, imageUrl: true } },
    },
  });

  const seen = new Set<string>();
  for (const sp of productsWithLocalImage) {
    const prod = sp.product;
    if (!prod || seen.has(prod.id)) continue;
    seen.add(prod.id);

    // Si catalogImagePath ya es URL de Cloudinary, ya está sincronizado
    if (sp.catalogImagePath?.startsWith('http')) {
      continue;
    }

    const localId = prod.imageUrl!.replace(LOCAL_IMAGE_PREFIX, '');
    const entry = index[localId];

    if (!entry) {
      failed++;
      errors.push(`imageUrl sin índice: ${localId}`);
      continue;
    }

    const filePath = path.join(LOCAL_IMAGES_DIR, entry.filename);
    if (!fs.existsSync(filePath)) {
      failed++;
      errors.push(`Archivo no encontrado: ${entry.filename}`);
      continue;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const cloudUrl = await uploadCatalogImage({ storeId, buffer, fileName: entry.filename, mimeType: mimeOf(entry.filename, entry.mime), kind: 'product' });

      // Solo actualizar catalogImagePath, NO productMaster.imageUrl
      await prisma.storeProduct.update({
        where: { id: sp.id },
        data: { catalogImagePath: cloudUrl },
      });

      synced++;
    } catch (err) {
      failed++;
      errors.push(`Error subiendo producto ${prod.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // El índice no cambia: no se reescribe (Windows puede bloquear Documentos)
  return NextResponse.json({
    ok: true,
    synced,
    failed,
    ...(errors.length > 0 && { errors }),
  });
}
