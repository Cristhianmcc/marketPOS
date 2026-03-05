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

// ─── DESKTOP: parseo manual de multipart (evita req.formData() que crashea en standalone) ───

async function parseMultipartImage(req: NextRequest): Promise<{
  buffer: Buffer; filename: string; contentType: string;
} | null> {
  const ct = req.headers.get('content-type') || '';
  const bMatch = ct.match(/boundary="?([^\s";]+)"?/);
  if (!bMatch) return null;

  const raw = Buffer.from(await req.arrayBuffer());
  const boundaryBuf = Buffer.from('--' + bMatch[1]);
  const headerEndMark = Buffer.from('\r\n\r\n');

  const positions: number[] = [];
  let idx = 0;
  while ((idx = raw.indexOf(boundaryBuf, idx)) !== -1) {
    positions.push(idx);
    idx += boundaryBuf.length;
  }

  for (let i = 0; i < positions.length - 1; i++) {
    const start = positions[i] + boundaryBuf.length + 2;
    const end = positions[i + 1] - 2;
    const part = raw.subarray(start, end);

    const hEnd = part.indexOf(headerEndMark);
    if (hEnd === -1) continue;

    const headers = part.subarray(0, hEnd).toString('utf-8');
    if (!headers.includes('name="image"')) continue;

    const fnMatch = headers.match(/filename="([^"]+)"/);
    const filename = fnMatch ? fnMatch[1] : 'upload.jpg';

    const ctMatch = headers.match(/Content-Type:\s*(.+)/i);
    const contentType = ctMatch ? ctMatch[1].trim() : '';

    return { buffer: Buffer.from(part.subarray(hEnd + 4)), filename, contentType };
  }

  return null;
}

function inferMimeFromHeader(rawCT: string, filename: string): string {
  const ct = (rawCT || '').toLowerCase().trim();
  if (ct.startsWith('image/')) return ct;
  const name = (filename || 'upload.jpg').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function saveLocalImageBuffer(buffer: Buffer, mimeType: string): string {
  ensureLocalDir();
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const localId = `logo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${localId}.${ext}`;
  fs.writeFileSync(path.join(LOCAL_IMAGES_DIR, filename), buffer);
  const index = loadIndex();
  index[localId] = { filename, mime: mimeType, createdAt: new Date().toISOString() };
  saveIndex(index);
  return `/api/desktop/local-image/${localId}`;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ─── DESKTOP: parseo manual del multipart, SIN req.formData() ────────────
  if (isDesktopMode()) {
    try {
      const parsed = await parseMultipartImage(req);
      if (!parsed || parsed.buffer.length === 0) {
        return NextResponse.json({ error: 'No se proporcionó ninguna imagen' }, { status: 400 });
      }

      const mimeType = inferMimeFromHeader(parsed.contentType, parsed.filename);
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!allowedTypes.includes(mimeType)) {
        return NextResponse.json({ error: 'Solo JPG, PNG y WEBP.' }, { status: 400 });
      }
      if (parsed.buffer.length > 3 * 1024 * 1024) {
        return NextResponse.json({ error: 'Máximo 3MB.' }, { status: 400 });
      }

      const url = saveLocalImageBuffer(parsed.buffer, mimeType);
      return NextResponse.json({ url });
    } catch (desktopErr: any) {
      console.error('[store-logo] Error saving local image:', desktopErr);
      return NextResponse.json(
        { error: `Error al guardar logo local: ${desktopErr?.message || String(desktopErr)}` },
        { status: 500 }
      );
    }
  }

  // ─── WEB: flujo original con Cloudinary (no se toca) ─────────────────────
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

    // Subir a Cloudinary
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
    });

    return NextResponse.json({ url: uploadResult.secure_url });
  } catch (error) {
    console.error('[store-logo] Error:', error);
    return NextResponse.json({ error: 'Error al subir logo' }, { status: 500 });
  }
}
