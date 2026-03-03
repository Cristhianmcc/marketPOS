/**
 * POST /api/sync/push
 *
 * Endpoint local llamado por el TaskQueue del desktop (tipo 'sync_data').
 * Recibe el payload y lo reenvía al cloud según el tipo de tarea.
 *
 * Payload esperado:
 * {
 *   type: 'catalog_product',
 *   data: { name, brand, content, category, barcode, imageUrl, unitType }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';

const CATALOG_CLOUD_URL = process.env.CATALOG_CLOUD_URL || '';
const CATALOG_SYNC_API_KEY = process.env.CATALOG_SYNC_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    // Solo permitir desde la app desktop (header interno)
    const isDesktop = req.headers.get('x-desktop-app') === 'true';
    if (!isDesktop) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await req.json() as { type: string; data: unknown };

    if (!payload?.type) {
      return NextResponse.json({ error: 'type requerido' }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Tipo: catalog_product → enviar al cloud catalog
    // ──────────────────────────────────────────────────────────────────────
    if (payload.type === 'catalog_product') {
      if (!CATALOG_CLOUD_URL || !CATALOG_SYNC_API_KEY) {
        // Si no está configurado, simplemente ignorar (no fallar)
        console.warn('[sync/push] CATALOG_CLOUD_URL o CATALOG_SYNC_API_KEY no configurados, skip.');
        return NextResponse.json({ ok: true, skipped: true });
      }

      const res = await fetch(`${CATALOG_CLOUD_URL}/api/catalog/contribute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CATALOG_SYNC_API_KEY,
        },
        body: JSON.stringify(payload.data),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error('[sync/push] catalog/contribute error:', res.status, body);
        return NextResponse.json(
          { error: `Cloud respondió ${res.status}` },
          { status: 502 }
        );
      }

      const result = await res.json();
      return NextResponse.json({ ok: true, result });
    }

    // Tipo desconocido → ignorar sin error para no bloquear la queue
    console.warn('[sync/push] Tipo desconocido:', payload.type);
    return NextResponse.json({ ok: true, skipped: true });

  } catch (error) {
    console.error('[sync/push] Error:', error);
    return NextResponse.json(
      { error: 'Error interno al sincronizar' },
      { status: 500 }
    );
  }
}
