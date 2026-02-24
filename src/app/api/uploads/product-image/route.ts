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

async function saveLocalImage(file: File): Promise<{ url: string; localId: string }> {
  ensureLocalDir();
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.type === 'image/png' ? 'png'
    : file.type === 'image/webp' ? 'webp'
    : 'jpg';
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${localId}.${ext}`;
  const filePath = path.join(LOCAL_IMAGES_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  const index = loadIndex();
  index[localId] = { filename, mime: file.type, createdAt: new Date().toISOString() };
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

    // Verificar configuración de Cloudinary
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

    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ninguna imagen' },
        { status: 400 }
      );
    }

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Solo JPG, PNG y WEBP.' },
        { status: 400 }
      );
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'La imagen es demasiado grande. Máximo 5MB.' },
        { status: 400 }
      );
    }

    // Convertir File a Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Subir a Cloudinary (fallback a local en desktop)
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
    }).catch(async (err) => {
      if (isDesktopMode()) {
        const local = await saveLocalImage(file);
        return { secure_url: local.url, public_id: local.localId, __local: true };
      }
      throw err;
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

    // Audit log error
    try {
      const user = await getCurrentUser();
      if (user) {
        await logAudit({
          storeId: user.storeId,
          userId: user.userId,
          action: 'PRODUCT_IMAGE_UPLOAD_FAILED',
          entityType: 'PRODUCT',
          severity: 'ERROR',
          meta: { error: String(error) },
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
          userAgent: req.headers.get('user-agent') || undefined,
        });
      }
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }

    return NextResponse.json(
      { error: 'Error al subir imagen' },
      { status: 500 }
    );
  }
}
