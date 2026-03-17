import * as fs from 'node:fs';
import * as path from 'node:path';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class CatalogMediaService {
  constructor(
    private readonly uploadDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  ensureUploadDir(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  buildPublicUrl(filename: string): string {
    return `${this.publicBaseUrl.replace(/\/+$/, '')}/uploads/catalog/${filename}`;
  }

  async saveBuffer(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<{ filename: string; fileUrl: string }> {
    if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
      throw new Error('Tipo de archivo no permitido. Solo JPG, PNG o WEBP.');
    }

    if (input.buffer.length > 5 * 1024 * 1024) {
      throw new Error('La imagen supera el tamaño maximo de 5MB.');
    }

    this.ensureUploadDir();

    const ext = input.mimeType === 'image/png' ? '.png'
      : input.mimeType === 'image/webp' ? '.webp'
      : '.jpg';

    const safeBase = path
      .basename(input.originalName || 'catalog-image', path.extname(input.originalName || ''))
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50) || 'catalog-image';

    const filename = `${Date.now()}-${safeBase}${ext}`;
    const absolutePath = path.join(this.uploadDir, filename);

    await fs.promises.writeFile(absolutePath, input.buffer);

    return {
      filename,
      fileUrl: this.buildPublicUrl(filename),
    };
  }
}
