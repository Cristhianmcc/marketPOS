/**
 * Fotos locales del escritorio para el catálogo de perfumería. Misma carpeta e
 * índice que la importación ZIP de inventario y `/api/desktop/local-image/[id]`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { nanoid } from 'nanoid';

const LOCAL_IMAGES_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
const INDEX_PATH = path.join(LOCAL_IMAGES_DIR, 'index.json');

type ImageIndex = Record<string, { filename: string; mime: string; createdAt: string }>;

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

export function isAllowedImageName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME, path.extname(name).toLowerCase());
}

export class LocalImageStore {
  private index: ImageIndex;

  constructor() {
    try {
      this.index = fs.existsSync(INDEX_PATH) ? JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')) : {};
    } catch {
      this.index = {};
    }
  }

  /** Guarda la imagen y devuelve la URL local para el producto. */
  save(buffer: Buffer, originalName: string): string {
    fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
    const id = nanoid();
    const ext = path.extname(originalName).toLowerCase() || '.jpg';
    const filename = `${id}${ext}`;
    fs.writeFileSync(path.join(LOCAL_IMAGES_DIR, filename), buffer);
    this.index[id] = { filename, mime: MIME[ext] ?? 'image/jpeg', createdAt: new Date().toISOString() };
    return `/api/desktop/local-image/${id}`;
  }

  flush() {
    fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
    fs.writeFileSync(INDEX_PATH, JSON.stringify(this.index, null, 2), 'utf-8');
  }
}
