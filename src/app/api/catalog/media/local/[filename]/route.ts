import { NextRequest } from 'next/server';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'catalog');

function getContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const params = await context.params;
  const requested = basename(params.filename || '');
  if (!requested) {
    return new Response('Archivo no encontrado', { status: 404 });
  }

  const filePath = resolve(UPLOAD_DIR, requested);
  if (!filePath.startsWith(resolve(UPLOAD_DIR)) || !existsSync(filePath)) {
    return new Response('Archivo no encontrado', { status: 404 });
  }

  const fileStat = await stat(filePath);
  const stream = createReadStream(filePath);

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': getContentType(requested),
      'Content-Length': String(fileStat.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

