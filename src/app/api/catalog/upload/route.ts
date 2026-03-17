import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'catalog');
const MAX_FILE_SIZE = {
  logo: 2 * 1024 * 1024,
  banner: 3 * 1024 * 1024,
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function isDesktopMode(): boolean {
  return process.env.DESKTOP_MODE === 'true';
}

// ─── DESKTOP: parseador manual multipart (evita req.formData() que crashea en standalone) ───
async function parseMultipartCatalogUpload(req: NextRequest): Promise<{
  buffer: Buffer; filename: string; contentType: string; fieldName: string; type: string;
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

  let fileBuffer: Buffer | null = null;
  let filename = 'upload.jpg';
  let contentType = '';
  let type = '';

  for (let i = 0; i < positions.length - 1; i++) {
    const start = positions[i] + boundaryBuf.length + 2;
    const end = positions[i + 1] - 2;
    const part = raw.subarray(start, end);
    const hEnd = part.indexOf(headerEndMark);
    if (hEnd === -1) continue;

    const headers = part.subarray(0, hEnd).toString('utf-8');
    const body = part.subarray(hEnd + 4);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const fieldNameStr = nameMatch ? nameMatch[1] : '';

    if (fieldNameStr === 'type') {
      type = body.toString('utf-8').trim();
    } else if (fieldNameStr === 'image') {
      const fnMatch = headers.match(/filename="([^"]+)"/);
      filename = fnMatch ? fnMatch[1] : 'upload.jpg';
      const ctMatch = headers.match(/Content-Type:\s*(.+)/i);
      contentType = ctMatch ? ctMatch[1].trim() : '';
      fileBuffer = Buffer.from(body);
    }
  }

  if (!fileBuffer) return null;
  return { buffer: fileBuffer, filename, contentType, fieldName: 'image', type };
}

function inferMimeType(rawCT: string, filename: string): string {
  const ct = (rawCT || '').toLowerCase().trim();
  if (ct.startsWith('image/')) return ct;
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function canUseCloudinary(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

async function saveLocalFile(input: {
  file: File;
  type: 'logo' | 'banner';
  storeId: string;
  buffer: Buffer;
}) {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const ext = input.file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const timestamp = Date.now();
  const filename = `${input.type}-${input.storeId}-${timestamp}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);
  await writeFile(filepath, input.buffer);

  return {
    success: true,
    url: `/api/catalog/media/local/${filename}`,
    filename,
  };
}

async function tryCloudinaryUpload(input: {
  type: 'logo' | 'banner';
  storeId: string;
  buffer: Buffer;
}) {
  const folder = `${process.env.CLOUDINARY_FOLDER || 'market-pos'}-catalog`;
  const uploadResult = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: `${input.type}-${input.storeId}-${Date.now()}`,
          overwrite: true,
          transformation:
            input.type === 'logo'
              ? [
                  { width: 600, height: 600, crop: 'limit' },
                  { quality: 'auto', fetch_format: 'auto' },
                ]
              : [
                  { width: 1800, height: 900, crop: 'limit' },
                  { quality: 'auto', fetch_format: 'auto' },
                ],
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error('No result from Cloudinary'));
          else resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      );
      uploadStream.end(input.buffer);
    }
  );

  return {
    success: true,
    url: uploadResult.secure_url,
    filename: uploadResult.public_id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.storeId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    let buffer: Buffer;
    let type: string;
    let mimeType: string;
    let fileName: string;

    // ─── DESKTOP: parseo manual de multipart (evita req.formData() que crashea en standalone) ───
    if (isDesktopMode()) {
      const parsed = await parseMultipartCatalogUpload(request);
      if (!parsed || parsed.buffer.length === 0) {
        return NextResponse.json({ error: 'No se proporciono archivo' }, { status: 400 });
      }
      buffer = parsed.buffer;
      type = parsed.type;
      mimeType = inferMimeType(parsed.contentType, parsed.filename);
      fileName = parsed.filename;
    } else {
      // ─── WEB: formData normal ───────────────────────────────────────────────
      const formData = await request.formData();
      const file = formData.get('image') as File;
      type = formData.get('type') as string;
      if (!file) {
        return NextResponse.json({ error: 'No se proporciono archivo' }, { status: 400 });
      }
      mimeType = file.type;
      fileName = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
    }

    if (!['logo', 'banner'].includes(type)) {
      return NextResponse.json({ error: 'Tipo de archivo invalido' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Usa PNG, JPG o WebP' },
        { status: 400 }
      );
    }

    const maxSize = MAX_FILE_SIZE[type as keyof typeof MAX_FILE_SIZE];
    if (buffer.length > maxSize) {
      return NextResponse.json(
        { error: `El archivo es demasiado grande. Maximo: ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // ─── Desktop: Cloudinary si está disponible, si no guardar local ─────────
    if (isDesktopMode()) {
      if (canUseCloudinary()) {
        try {
          const cloud = await tryCloudinaryUpload({
            type: type as 'logo' | 'banner',
            storeId: session.storeId,
            buffer,
          });
          return NextResponse.json(cloud);
        } catch (cloudError) {
          console.error('[catalog/upload] Cloudinary failed en desktop, usando local:', cloudError);
        }
      }
      // Sin Cloudinary o si falló: guardar local con nombre simulado
      const fakeFile = { name: fileName } as File;
      const local = await saveLocalFile({
        file: fakeFile,
        type: type as 'logo' | 'banner',
        storeId: session.storeId,
        buffer,
      });
      return NextResponse.json(local);
    }

    // ─── Web: Cloudinary primero, fallback local ──────────────────────────────
    if (canUseCloudinary()) {
      try {
        const cloud = await tryCloudinaryUpload({
          type: type as 'logo' | 'banner',
          storeId: session.storeId,
          buffer,
        });
        return NextResponse.json(cloud);
      } catch (cloudError) {
        console.error('[catalog/upload] Cloudinary failed, using local fallback:', cloudError);
      }
    }

    const fakeFile = { name: fileName } as File;
    const local = await saveLocalFile({
      file: fakeFile,
      type: type as 'logo' | 'banner',
      storeId: session.storeId,
      buffer,
    });
    return NextResponse.json(local);
  } catch (error) {
    console.error('Upload error:', error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : String(error);
    return NextResponse.json({ error: `Error al subir archivo: ${message}` }, { status: 500 });
  }
}

