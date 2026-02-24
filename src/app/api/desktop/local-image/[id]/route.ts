import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOCAL_IMAGES_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
const INDEX_PATH = path.join(LOCAL_IMAGES_DIR, 'index.json');

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
    // ignore
  }
  return {};
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isDesktopMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { id } = await params;
  const index = loadIndex();
  const entry = index[id];
  if (!entry) {
    return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 });
  }

  const filePath = path.join(LOCAL_IMAGES_DIR, entry.filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': entry.mime || 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}
