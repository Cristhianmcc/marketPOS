import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
import { Readable } from 'stream';
import { PassThrough } from 'stream';

const LOCAL_IMAGES_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
const INDEX_PATH = path.join(LOCAL_IMAGES_DIR, 'index.json');

function isDesktopMode(): boolean {
  return process.env.DESKTOP_MODE === 'true';
}

function loadIndex(): Record<string, { filename: string; mime: string; createdAt: string }> {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Extrae el id de una URL local /api/desktop/local-image/{id}
function extractLocalId(imageUrl: string): string | null {
  const match = imageUrl.match(/\/api\/desktop\/local-image\/([^/?#]+)/);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!isDesktopMode()) {
      return NextResponse.json({ error: 'Solo disponible en modo desktop' }, { status: 400 });
    }

    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (!session.storeId) {
      return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });
    }

    const products = await prisma.storeProduct.findMany({
      where: { storeId: session.storeId },
      include: { product: true },
      orderBy: { product: { name: 'asc' } },
    });

    const index = loadIndex();

    // Construir CSV con nombre de archivo local en vez de URL
    const headers = [
      'Nombre', 'Marca', 'Contenido', 'Categoria', 'Codigo', 'Tipo',
      'Precio', 'Stock', 'Stock Minimo', 'Estado', 'Imagen',
    ];

    // Mapa: productId → nombre de archivo de imagen (para incluirlo en el ZIP)
    const imageFiles: { csvName: string; localPath: string }[] = [];

    const rows = products.map(sp => {
      let imageCsvValue = '';
      const imageUrl = sp.product.imageUrl || '';

      if (imageUrl) {
        const localId = extractLocalId(imageUrl);
        if (localId && index[localId]) {
          const entry = index[localId];
          const ext = path.extname(entry.filename) || '.jpg';
          // Nombre seguro para el archivo en el ZIP
          const safeName = sp.product.name
            .replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50) + ext;
          imageCsvValue = `imagenes/${safeName}`;
          imageFiles.push({
            csvName: safeName,
            localPath: path.join(LOCAL_IMAGES_DIR, entry.filename),
          });
        } else if (imageUrl.startsWith('http')) {
          // Imagen Cloudinary u otra URL externa — poner la URL directamente
          imageCsvValue = imageUrl;
        }
      }

      return [
        escapeCSV(sp.product.name),
        escapeCSV(sp.product.brand || ''),
        escapeCSV(sp.product.content || ''),
        escapeCSV(sp.product.category),
        escapeCSV(sp.product.barcode || sp.product.internalSku),
        escapeCSV(sp.product.unitType === 'UNIT' ? 'Unidad' : 'KG'),
        escapeCSV(Number(sp.price).toFixed(2)),
        escapeCSV(sp.stock !== null ? Number(sp.stock).toFixed(3) : ''),
        escapeCSV(sp.minStock !== null ? Number(sp.minStock).toFixed(3) : ''),
        escapeCSV(sp.active ? 'Activo' : 'Inactivo'),
        escapeCSV(imageCsvValue),
      ];
    });

    const csvContent = '\uFEFF' + [
      headers.join(';'),
      ...rows.map(row => row.join(';')),
    ].join('\n');

    const dateStr = new Date().toISOString().split('T')[0];

    // Crear ZIP en memoria usando PassThrough
    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.pipe(passThrough);

    // Agregar CSV al ZIP
    archive.append(Buffer.from(csvContent, 'utf-8'), {
      name: `inventario_${dateStr}.csv`,
    });

    // Agregar imágenes locales existentes
    for (const img of imageFiles) {
      if (fs.existsSync(img.localPath)) {
        archive.file(img.localPath, { name: `imagenes/${img.csvName}` });
      }
    }

    // README dentro del ZIP
    const readme = `Exportación de inventario - ${dateStr}

El archivo inventario_${dateStr}.csv contiene todos tus productos.
La columna "Imagen" indica el nombre del archivo dentro de la carpeta "imagenes/".

Para ver las imágenes en Excel:
1. Abre el CSV con Excel
2. Las imágenes están en la carpeta "imagenes/" de este mismo ZIP
`;
    archive.append(Buffer.from(readme, 'utf-8'), { name: 'LEEME.txt' });

    archive.finalize();

    // Recolectar el stream en un Buffer
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      passThrough.on('data', (chunk) => chunks.push(chunk));
      passThrough.on('end', resolve);
      passThrough.on('error', reject);
      archive.on('error', reject);
    });

    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="inventario_${dateStr}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error('Error exporting inventory ZIP:', error);
    return NextResponse.json({ error: 'Error al exportar inventario' }, { status: 500 });
  }
}
