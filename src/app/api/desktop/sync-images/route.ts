import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '@/lib/prisma';

const LOCAL_IMAGES_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
const INDEX_PATH = path.join(LOCAL_IMAGES_DIR, 'index.json');

function isDesktopMode(): boolean {
  return process.env.DESKTOP_MODE === 'true';
}

function ensureDir(): void {
  if (!fs.existsSync(LOCAL_IMAGES_DIR)) {
    fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
  }
}

function loadIndex(): Record<string, { filename: string; mime: string; createdAt: string }> {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
      return JSON.parse(raw) as Record<string, { filename: string; mime: string; createdAt: string }>;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveIndex(index: Record<string, { filename: string; mime: string; createdAt: string }>): void {
  ensureDir();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

export async function POST(_req: NextRequest) {
  if (!isDesktopMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Configurar Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return NextResponse.json({ error: 'Cloudinary no configurado' }, { status: 500 });
  }

  const index = loadIndex();
  const entries = Object.entries(index);
  if (entries.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 });
  }

  let synced = 0;
  const folder = process.env.CLOUDINARY_FOLDER || 'market-pos-products';

  for (const [id, entry] of entries) {
    const filePath = path.join(LOCAL_IMAGES_DIR, entry.filename);
    if (!fs.existsSync(filePath)) {
      delete index[id];
      continue;
    }

    const buffer = fs.readFileSync(filePath);

    try {
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            transformation: [
              { width: 800, height: 800, crop: 'limit' },
              { quality: 'auto', fetch_format: 'auto' },
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        uploadStream.end(buffer);
      });

      const localUrl = `/api/desktop/local-image/${id}`;

      await prisma.product.updateMany({
        where: { imageUrl: localUrl },
        data: { imageUrl: uploadResult.secure_url },
      });

      fs.unlinkSync(filePath);
      delete index[id];
      synced++;
    } catch {
      // Keep entry for retry later
      continue;
    }
  }

  saveIndex(index);

  return NextResponse.json({ ok: true, synced, pending: Object.keys(index).length });
}
