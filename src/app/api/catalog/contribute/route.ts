/**
 * POST /api/catalog/contribute
 *
 * Endpoint CLOUD — recibe productos desde instancias desktop de clientes.
 * Autenticado solo con API key (sin sesión de usuario).
 *
 * Payload:
 * {
 *   name: string,
 *   brand?: string,
 *   content?: string,
 *   category?: string,
 *   barcode?: string,
 *   imageUrl?: string,
 *   unitType?: 'UNIT' | 'KG',
 *   sourceStoreId?: string   // para trazabilidad (opcional)
 * }
 *
 * Lógica de deduplicación:
 *   1. Si tiene barcode → busca por barcode
 *   2. Si no → busca por fingerprint (name+brand+content normalizados)
 *   3. Si ya existe → devuelve { action: 'exists' }
 *   4. Si no existe → crea nuevo ProductMaster con isGlobal: false
 *      (tú decides cuáles publicar al catálogo global desde el panel)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { nanoid } from 'nanoid';

const CATALOG_SYNC_API_KEY = process.env.CATALOG_SYNC_API_KEY || '';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function normalizeText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFingerprint(name: string, brand?: string | null, content?: string | null): string {
  return normalizeText(`${name}${brand || ''}${content || ''}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Validar API key
    if (!CATALOG_SYNC_API_KEY) {
      return NextResponse.json({ error: 'Endpoint no configurado' }, { status: 503 });
    }

    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== CATALOG_SYNC_API_KEY) {
      return NextResponse.json({ error: 'API key inválida' }, { status: 401 });
    }

    // 2. Parsear body
    const body = await req.json() as {
      name?: string;
      brand?: string;
      content?: string;
      category?: string;
      barcode?: string;
      imageUrl?: string;
      unitType?: 'UNIT' | 'KG';
      sourceStoreId?: string;
    };

    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json({ error: 'name requerido (mínimo 2 caracteres)' }, { status: 400 });
    }

    const name     = body.name.trim();
    const brand    = body.brand?.trim() || null;
    const content  = body.content?.trim() || null;
    const category = body.category?.trim() || 'Otros';
    const barcode  = body.barcode?.trim() || null;
    const imageUrl = body.imageUrl || null;
    const unitType = body.unitType === 'KG' ? 'KG' : 'UNIT';
    const normalizedName = normalizeText(name);
    const fingerprint    = buildFingerprint(name, brand, content);

    // 3. Buscar duplicado
    let existing = null;

    if (barcode) {
      existing = await prisma.productMaster.findUnique({
        where: { barcode },
        select: { id: true, name: true },
      });
    }

    if (!existing) {
      existing = await prisma.productMaster.findFirst({
        where: { fingerprint },
        select: { id: true, name: true },
      });
    }

    if (existing) {
      return NextResponse.json({
        action: 'exists',
        productId: existing.id,
        message: 'Producto ya existe en el catálogo',
      });
    }

    // 4. Crear nuevo
    const internalSku = `CONTRIB-${nanoid(10).toUpperCase()}`;

    const created = await prisma.productMaster.create({
      data: {
        name,
        brand,
        content,
        category,
        barcode,
        imageUrl,
        unitType,
        internalSku,
        normalizedName,
        fingerprint,
        isGlobal: false, // El dueño decide cuándo publicarlo
        createdByStoreId: body.sourceStoreId || null,
      },
      select: { id: true, name: true, barcode: true, fingerprint: true },
    });

    console.log(`[catalog/contribute] Nuevo producto contribuido: "${name}" (${created.id})`);

    return NextResponse.json({
      action: 'created',
      productId: created.id,
      message: 'Producto añadido al catálogo',
    }, { status: 201 });

  } catch (error) {
    console.error('[catalog/contribute] Error:', error);
    return NextResponse.json(
      { error: 'Error interno al procesar contribución' },
      { status: 500 }
    );
  }
}
