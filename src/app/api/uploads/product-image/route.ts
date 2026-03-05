import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { logAudit } from '@/lib/auditLog';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Configurar Cloudinary (asegúrate de tener las variables de entorno)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
      const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
      return JSON.parse(raw) as Record<string, { filename: string; mime: string; createdAt: string }>;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveIndex(index: Record<string, { filename: string; mime: string; createdAt: string }>): void {
  ensureLocalDir();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

// ─── DESKTOP: parseo manual de multipart (evita req.formData() que crashea en standalone) ───

/**
 * Parsea multipart/form-data manualmente leyendo el body crudo.
 * req.formData() de Next.js standalone tiene un bug que llama toLowerCase
 * en un valor undefined internamente. Esta función lo evita por completo.
 */
async function parseMultipartImage(req: NextRequest): Promise<{
  buffer: Buffer; filename: string; contentType: string;
} | null> {
  const ct = req.headers.get('content-type') || '';
  const bMatch = ct.match(/boundary="?([^\s";]+)"?/);
  if (!bMatch) return null;

  const raw = Buffer.from(await req.arrayBuffer());
  const boundaryBuf = Buffer.from('--' + bMatch[1]);
  const headerEndMark = Buffer.from('\r\n\r\n');

  // Encontrar posiciones de boundaries
  const positions: number[] = [];
  let idx = 0;
  while ((idx = raw.indexOf(boundaryBuf, idx)) !== -1) {
    positions.push(idx);
    idx += boundaryBuf.length;
  }

  for (let i = 0; i < positions.length - 1; i++) {
    const start = positions[i] + boundaryBuf.length + 2; // +2 CRLF
    const end = positions[i + 1] - 2; // -2 CRLF antes del siguiente boundary
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

/** Infiere MIME del Content-Type del part o del nombre del archivo */
function inferMimeFromHeader(rawCT: string, filename: string): string {
  const ct = (rawCT || '').toLowerCase().trim();
  if (ct.startsWith('image/')) return ct;
  const name = (filename || 'upload.jpg').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/** Guarda un Buffer de imagen directamente en disco */
function saveLocalImageBuffer(
  buffer: Buffer, mimeType: string
): { url: string; localId: string } {
  ensureLocalDir();
  const ext = mimeType === 'image/png' ? 'png'
    : mimeType === 'image/webp' ? 'webp'
    : 'jpg';
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${localId}.${ext}`;
  fs.writeFileSync(path.join(LOCAL_IMAGES_DIR, filename), buffer);

  const index = loadIndex();
  index[localId] = { filename, mime: mimeType, createdAt: new Date().toISOString() };
  saveIndex(index);

  return { url: `/api/desktop/local-image/${localId}`, localId };
}

/**
 * POST /api/uploads/product-image
 * Sube una imagen de producto a Cloudinary
 * Auth: OWNER
 * Body: FormData con field 'image'
 * Returns: { url }
 */
export async function POST(req: NextRequest) {
  // ─── DESKTOP: parseo manual del multipart, SIN req.formData() ────────────
  // req.formData() de Next.js standalone crashea con toLowerCase en undefined.
  // Parseamos el body crudo directamente para evitarlo.
  if (isDesktopMode()) {
    try {
      const parsed = await parseMultipartImage(req);
      if (!parsed || parsed.buffer.length === 0) {
        return NextResponse.json(
          { error: 'No se proporcionó ninguna imagen' },
          { status: 400 }
        );
      }

      const mimeType = inferMimeFromHeader(parsed.contentType, parsed.filename);
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!allowedTypes.includes(mimeType)) {
        return NextResponse.json(
          { error: 'Tipo de archivo no permitido. Solo JPG, PNG y WEBP.' },
          { status: 400 }
        );
      }

      if (parsed.buffer.length > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'La imagen es demasiado grande. Máximo 5MB.' },
          { status: 400 }
        );
      }

      const local = saveLocalImageBuffer(parsed.buffer, mimeType);
      return NextResponse.json({
        url: local.url,
        publicId: local.localId,
        pending: false,
      });
    } catch (desktopErr: any) {
      console.error('[desktop] Error saving local image:', desktopErr);
      return NextResponse.json(
        { error: `Error al guardar imagen local: ${desktopErr?.message || String(desktopErr)}` },
        { status: 500 }
      );
    }
  }

  // ─── WEB: flujo original con Cloudinary (no se toca) ─────────────────────
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede subir imágenes' },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ninguna imagen' },
        { status: 400 }
      );
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Solo JPG, PNG y WEBP.' },
        { status: 400 }
      );
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'La imagen es demasiado grande. Máximo 5MB.' },
        { status: 400 }
      );
    }

    // Modo web: verificar Cloudinary
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return NextResponse.json(
        { error: 'Cloudinary no está configurado. Contacta al administrador.' },
        { status: 500 }
      );
    }

    // Convertir File a Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Subir a Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const folder = process.env.CLOUDINARY_FOLDER || 'market-pos-products';
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
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

    // Audit log
    await logAudit({
      storeId: user.storeId,
      userId: user.userId,
      action: 'PRODUCT_IMAGE_UPLOADED',
      entityType: 'PRODUCT',
      severity: 'INFO',
      meta: {
        imageUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      pending: Boolean(uploadResult.__local),
    });
  } catch (error) {
    console.error('Error uploading product image:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Audit log error (no-blocking)
    try {
      const user = await getCurrentUser();
      if (user) {
        logAudit({
          storeId: user.storeId,
          userId: user.userId,
          action: 'PRODUCT_IMAGE_UPLOAD_FAILED',
          entityType: 'PRODUCT',
          severity: 'ERROR',
          meta: { error: errorMessage },
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
          userAgent: req.headers.get('user-agent') || undefined,
        }).catch(() => {});
      }
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }

    return NextResponse.json(
      { error: `Error al subir imagen: ${errorMessage}` },
      { status: 500 }
    );
  }
}
