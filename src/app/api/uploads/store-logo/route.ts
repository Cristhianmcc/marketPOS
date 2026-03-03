/**
 * POST /api/uploads/store-logo
 * Sube el logo de la tienda a Cloudinary (o almacenamiento local en desktop).
 * Retorna la URL pública del logo para guardar en store_settings.ticket_logo
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Local fallback (desktop sin Cloudinary) ────────────────────────────────

const LOCAL_IMAGES_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
const INDEX_PATH = path.join(LOCAL_IMAGES_DIR, 'index.json');

function isDesktopMode(): boolean {
  return process.env.DESKTOP_MODE === 'true';
}

function ensureLocalDir(): void {
  if (!fs.existsSync(LOCAL_IMAGES_DIR)) {
    fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
  }
}

function loadIndex(): Record<string, { filename: string; mime: string; createdAt: string }> {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveIndex(index: Record<string, { filename: string; mime: string; createdAt: string }>): void {
  ensureLocalDir();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

async function saveLocalImage(file: File): Promise<string> {
  ensureLocalDir();
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const localId = `logo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${localId}.${ext}`;
  fs.writeFileSync(path.join(LOCAL_IMAGES_DIR, filename), buffer);
  const index = loadIndex();
  index[localId] = { filename, mime: file.type, createdAt: new Date().toISOString() };
  saveIndex(index);
  return `/api/desktop/local-image/${localId}`;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (user.role !== 'OWNER') return NextResponse.json({ error: 'Solo el propietario puede subir el logo' }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) return NextResponse.json({ error: 'No se proporcionó ninguna imagen' }, { status: 400 });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Solo JPG, PNG y WEBP.' }, { status: 400 });
    }
    if (file.size > 3 * 1024 * 1024) {
      return NextResponse.json({ error: 'Máximo 3MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Intentar Cloudinary; si falla y es desktop, guardar local
    const uploadResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const folder = `${process.env.CLOUDINARY_FOLDER || 'market-pos'}-logos`;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: `store_${user.storeId}_logo`,
          overwrite: true,
          transformation: [
            { width: 400, height: 200, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error('No result'));
          else resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      );
      uploadStream.end(buffer);
    }).catch(async (err) => {
      if (isDesktopMode()) {
        const url = await saveLocalImage(file);
        return { secure_url: url, public_id: 'local' };
      }
      throw err;
    });

    return NextResponse.json({ url: uploadResult.secure_url });
  } catch (error) {
    console.error('[store-logo] Error:', error);
    return NextResponse.json({ error: 'Error al subir logo' }, { status: 500 });
  }
}
