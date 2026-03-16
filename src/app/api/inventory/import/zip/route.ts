/**
 * POST /api/inventory/import/zip
 *
 * Importa un ZIP exportado por Monterrial POS (desktop).
 * El ZIP contiene:
 *   - inventario_YYYY-MM-DD.csv  (formato semicolón, cabeceras en español)
 *   - imagenes/                  (archivos de imagen referenciados en el CSV)
 *   - LEEME.txt
 *
 * Body JSON:
 *   { action: 'preview' | 'import', fileBase64: string, updateExisting?: boolean }
 *
 * Solo disponible en modo desktop (DESKTOP_MODE=true).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { nanoid } from 'nanoid';

const LOCAL_IMAGES_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
const INDEX_PATH = path.join(LOCAL_IMAGES_DIR, 'index.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDesktopMode() {
  return process.env.DESKTOP_MODE === 'true';
}

function loadIndex(): Record<string, { filename: string; mime: string; createdAt: string }> {
  try {
    if (fs.existsSync(INDEX_PATH)) return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  } catch { /* ignore */ }
  return {};
}

function saveIndex(index: Record<string, { filename: string; mime: string; createdAt: string }>) {
  fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

/** Parsea el CSV del ZIP (formato exportación: cabeceras en español, separador ;, con BOM) */
function parseExportCsv(content: string): Record<string, string>[] {
  // Quitar BOM si existe
  const clean = content.startsWith('\uFEFF') ? content.slice(1) : content;
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

/** Divide una línea CSV respetando comillas dobles */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ';' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Guarda una imagen desde un buffer y la registra en index.json. Devuelve el id. */
function saveLocalImage(
  buf: Buffer,
  originalFilename: string,
  index: Record<string, { filename: string; mime: string; createdAt: string }>
): string {
  fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
  const id = nanoid();
  const ext = path.extname(originalFilename) || '.jpg';
  const filename = `${id}${ext}`;
  const mime = extToMime(ext);
  fs.writeFileSync(path.join(LOCAL_IMAGES_DIR, filename), buf);
  index[id] = { filename, mime, createdAt: new Date().toISOString() };
  return id;
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return map[ext.toLowerCase()] ?? 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
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

    const body = await req.json() as {
      action: 'preview' | 'import';
      fileBase64: string;
      updateExisting?: boolean;
    };

    // Decodificar ZIP desde base64
    const zipBuffer = Buffer.from(body.fileBase64, 'base64');
    const zip = new AdmZip(zipBuffer);

    // Encontrar el CSV dentro del ZIP
    const csvEntry = zip.getEntries().find(e =>
      !e.isDirectory && e.name.endsWith('.csv')
    );
    if (!csvEntry) {
      return NextResponse.json({ error: 'No se encontró un archivo CSV dentro del ZIP' }, { status: 400 });
    }

    const csvContent = csvEntry.getData().toString('utf-8');
    const rows = parseExportCsv(csvContent);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'El CSV está vacío' }, { status: 400 });
    }

    // Contar entradas de imágenes en el ZIP
    const imageEntries = zip.getEntries().filter(e =>
      !e.isDirectory && e.entryName.startsWith('imagenes/')
    );
    const imageNames = new Set(imageEntries.map(e => e.name));

    // Contar cuántos productos tienen imagen referenciada en el ZIP
    let productsWithZipImage = 0;
    let productsWithExtUrl = 0;
    for (const row of rows) {
      const img = row['Imagen'] || '';
      if (img.startsWith('imagenes/')) {
        const fname = img.replace('imagenes/', '');
        if (imageNames.has(fname)) productsWithZipImage++;
      } else if (img.startsWith('http')) {
        productsWithExtUrl++;
      }
    }

    // ── PREVIEW ─────────────────────────────────────────────────────────────
    if (body.action === 'preview') {
      const preview = rows.slice(0, 5).map(r => ({
        name: r['Nombre'] || '',
        brand: r['Marca'] || '',
        category: r['Categoria'] || '',
        price: r['Precio'] || '',
        stock: r['Stock'] || '',
        hasImage: !!(r['Imagen'] && r['Imagen'].trim()),
      }));

      return NextResponse.json({
        totalProducts: rows.length,
        productsWithZipImage,
        productsWithExtUrl,
        totalImages: imageEntries.length,
        preview,
      });
    }

    // ── IMPORT ──────────────────────────────────────────────────────────────
    const updateExisting = body.updateExisting ?? true;
    const index = loadIndex();

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        const name = row['Nombre']?.trim();
        if (!name) { skipped++; continue; }

        const category = row['Categoria']?.trim() || 'Otros';
        const barcode = row['Codigo']?.trim() || null;
        const brand = row['Marca']?.trim() || null;
        const content = row['Contenido']?.trim() || null;
        const unitType = row['Tipo']?.trim() === 'KG' ? 'KG' : 'UNIT';
        const price = parseFloat(row['Precio']?.replace(',', '.') || '0') || 0;
        const stock = parseFloat(row['Stock']?.replace(',', '.') || '0') || 0;
        const minStock = row['Stock Minimo']?.trim()
          ? parseFloat(row['Stock Minimo'].replace(',', '.'))
          : null;

        // Resolver imagen
        let imageUrl: string | null = null;
        const imgCell = row['Imagen']?.trim() || '';
        if (imgCell.startsWith('imagenes/')) {
          const fname = imgCell.replace('imagenes/', '');
          const imgEntry = imageEntries.find(e => e.name === fname);
          if (imgEntry) {
            const imgBuf = imgEntry.getData();
            const savedId = saveLocalImage(imgBuf, fname, index);
            imageUrl = `/api/desktop/local-image/${savedId}`;
          }
        } else if (imgCell.startsWith('http')) {
          imageUrl = imgCell;
        }

        // Buscar producto existente por código de barras o nombre
        let existingProduct = barcode
          ? await prisma.productMaster.findFirst({ where: { barcode } })
          : null;
        if (!existingProduct) {
          existingProduct = await prisma.productMaster.findFirst({ where: { name } });
        }

        if (existingProduct) {
          // Actualizar imagen si vino una nueva del ZIP
          if (imageUrl) {
            await prisma.productMaster.update({
              where: { id: existingProduct.id },
              data: { imageUrl },
            });
          }

          // Ver si ya está en la tienda
          const sp = await prisma.storeProduct.findFirst({
            where: { productId: existingProduct.id, storeId: session.storeId },
          });

          if (!sp) {
            await prisma.storeProduct.create({
              data: {
                productId: existingProduct.id,
                storeId: session.storeId,
                price,
                stock,
                minStock,
                active: true,
              },
            });
            updated++;
          } else if (updateExisting) {
            await prisma.storeProduct.update({
              where: { id: sp.id },
              data: { price, stock, minStock },
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Crear producto nuevo
          const newProduct = await prisma.productMaster.create({
            data: {
              name,
              brand,
              category,
              content,
              barcode,
              internalSku: `SKU-${nanoid(10)}`,
              unitType: unitType as 'UNIT' | 'KG',
              imageUrl,
            },
          });

          await prisma.storeProduct.create({
            data: {
              productId: newProduct.id,
              storeId: session.storeId,
              price,
              stock,
              minStock,
              active: true,
            },
          });

          created++;
        }
      } catch (err) {
        console.error('[ZIP Import] Error en fila:', row['Nombre'], err);
        skipped++;
      }
    }

    // Guardar index.json actualizado con todas las imágenes nuevas
    saveIndex(index);

    return NextResponse.json({ success: true, created, updated, skipped });

  } catch (error) {
    console.error('[ZIP Import] Error:', error);
    return NextResponse.json({ error: 'Error al procesar el ZIP' }, { status: 500 });
  }
}
