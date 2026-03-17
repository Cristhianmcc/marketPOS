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
  logo: 2 * 1024 * 1024, // 2MB for logo
  banner: 3 * 1024 * 1024, // 3MB for banner
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function isDesktopMode(): boolean {
  return process.env.DESKTOP_MODE === 'true';
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
    url: `/uploads/catalog/${filename}`,
    filename,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.storeId) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('image') as File;
    const type = formData.get('type') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó archivo' },
        { status: 400 }
      );
    }

    if (!['logo', 'banner'].includes(type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo inválido' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Use PNG, JPG o WebP' },
        { status: 400 }
      );
    }

    // Validate file size
    const maxSize = MAX_FILE_SIZE[type as keyof typeof MAX_FILE_SIZE];
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `El archivo es demasiado grande. Máximo: ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Web (Render/prod): use Cloudinary so images are persistent and public.
    // Desktop/offline/dev keeps local disk behavior.
    if (!isDesktopMode() && canUseCloudinary()) {
      try {
        const folder = `${process.env.CLOUDINARY_FOLDER || 'market-pos'}-catalog`;
        const uploadResult = await new Promise<{ secure_url: string; public_id: string }>(
          (resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder,
                public_id: `${type}-${session.storeId}-${Date.now()}`,
                overwrite: true,
                transformation:
                  type === 'logo'
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
                if (error || !result) reject(error ?? new Error('No result'));
                else resolve({ secure_url: result.secure_url, public_id: result.public_id });
              }
            );
            uploadStream.end(buffer);
          }
        );

        return NextResponse.json({
          success: true,
          url: uploadResult.secure_url,
          filename: uploadResult.public_id,
        });
      } catch (cloudinaryError) {
        // If cloud upload fails in web, keep the flow working with local fallback.
        console.error('[catalog/upload] Cloudinary failed, using local fallback:', cloudinaryError);
      }
    }

    // Local fallback (desktop/dev)
    const localResult = await saveLocalFile({
      file,
      type: type as 'logo' | 'banner',
      storeId: session.storeId,
      buffer,
    });
    return NextResponse.json(localResult);
  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Error al subir archivo: ${message}` },
      { status: 500 }
    );
  }
}
