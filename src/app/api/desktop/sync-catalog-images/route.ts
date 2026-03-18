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
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const LOCAL_IMAGES_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
const INDEX_PATH = path.join(LOCAL_IMAGES_DIR, 'index.json');
const LOCAL_IMAGE_PREFIX = '/api/desktop/local-image/';

function isDesktopMode(): boolean {
  return process.env.DESKTOP_MODE === 'true';
}

function hasCloudinaryConfig(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
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

function saveIndex(
  index: Record<string, { filename: string; mime: string; createdAt: string }>,
): void {
  if (!fs.existsSync(LOCAL_IMAGES_DIR)) {
    fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error || !result) reject(error ?? new Error('No result from Cloudinary'));
        else resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

// ─── GET: contar imágenes pendientes ───────────────────────────────────────

export async function GET(_req: NextRequest) {
  if (!isDesktopMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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
      cloudinaryConfigured: hasCloudinaryConfig(),
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
        cloudinaryConfigured: hasCloudinaryConfig(),
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

  if (!hasCloudinaryConfig()) {
    return NextResponse.json(
      { error: 'Cloudinary no está configurado. Verifica las variables CLOUDINARY_*.' },
      { status: 500 },
    );
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const folder = process.env.CLOUDINARY_FOLDER || 'market-pos-products';
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
      const cloudUrl = await uploadBufferToCloudinary(buffer, folder);

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
      const cloudUrl = await uploadBufferToCloudinary(buffer, folder);

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

  saveIndex(index);

  return NextResponse.json({
    ok: true,
    synced,
    failed,
    ...(errors.length > 0 && { errors }),
  });
}
