/**
 * MÓDULO PH7 — Reportes Farmacéuticos
 *
 * GET /api/reports/pharma?report=<type>&from=<date>&to=<date>&format=json|csv
 *
 * report values:
 *   stock-by-batch     — stock actual por lote
 *   expiring           — próximos a vencer (≤alertDays días)
 *   expired            — vencidos (expiryDate < hoy, qty > 0)
 *   sales-by-lab       — ventas agrupadas por laboratorio
 *   sales-by-generic   — ventas agrupadas por genérico/comercial
 *   rx-sold            — productos Rx auditados (audit_logs action=RX_PRODUCT_SOLD)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

// ── helpers ────────────────────────────────────────────────────────────────────

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: string[][]): Response {
  const csv =
    '\uFEFF' +
    [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  const date = new Date().toISOString().split('T')[0];
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reporte_farma_${date}.csv"`,
    },
  });
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ── route ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId || !session.storeId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (session.role === 'CASHIER') {
      return NextResponse.json({ error: 'Acceso no permitido' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const report = searchParams.get('report') || 'stock-by-batch';
    const format = searchParams.get('format') || 'json';

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const fromDate = from
      ? new Date(from + 'T00:00:00.000-05:00')
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to + 'T23:59:59.999-05:00') : new Date();

    const storeId = session.storeId;

    // ── Verificar flag ENABLE_BATCH_EXPIRY para reportes de lotes ──────────────
    const batchEnabled = await isFeatureEnabled(storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);

    // Leer alertDays de settings
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
      select: { expiryAlertDays: true },
    });
    const alertDays = settings?.expiryAlertDays ?? 60;

    // ══════════════════════════════════════════════════════════════════════════
    // 1) STOCK POR LOTE
    // ══════════════════════════════════════════════════════════════════════════
    if (report === 'stock-by-batch') {
      if (!batchEnabled) {
        return NextResponse.json({ error: 'Módulo de lotes no activo' }, { status: 403 });
      }

      const batches = await prisma.productBatch.findMany({
        where: {
          storeId,
          active: true,
          quantityAvailable: { gt: 0 },
        },
        include: {
          storeProduct: {
            include: {
              product: {
                select: {
                  name: true,
                  commercialName: true,
                  genericName: true,
                  concentration: true,
                  pharmaceuticalForm: true,
                  presentation: true,
                  laboratory: true,
                  barcode: true,
                  category: true,
                  requiresPrescription: true,
                },
              },
            },
          },
        },
        orderBy: [{ storeProduct: { product: { name: 'asc' } } }, { expiryDate: 'asc' }],
      });

      const rows = batches.map((b) => {
        const p = b.storeProduct.product;
        const days = Math.ceil((b.expiryDate.getTime() - Date.now()) / 86_400_000);
        return {
          productName: p.name,
          commercialName: p.commercialName,
          genericName: p.genericName,
          concentration: p.concentration,
          pharmaceuticalForm: p.pharmaceuticalForm,
          presentation: p.presentation,
          laboratory: p.laboratory,
          category: p.category,
          barcode: p.barcode,
          requiresPrescription: p.requiresPrescription,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          daysToExpiry: days,
          quantityAvailable: Number(b.quantityAvailable),
          quantityInitial: Number(b.quantityInitial),
          unitCost: b.unitCost ? Number(b.unitCost) : null,
        };
      });

      if (format === 'csv') {
        const headers = [
          'Producto', 'Comercial', 'Genérico', 'Concentración', 'Forma Farm.',
          'Presentación', 'Laboratorio', 'Categoría', 'Código', 'Rx',
          'Lote', 'Vencimiento', 'Días Rest.', 'Stock Disp.', 'Stock Inicial', 'Costo Unit.',
        ];
        const csvRows = rows.map((r) => [
          escapeCSV(r.productName), escapeCSV(r.commercialName), escapeCSV(r.genericName),
          escapeCSV(r.concentration), escapeCSV(r.pharmaceuticalForm), escapeCSV(r.presentation),
          escapeCSV(r.laboratory), escapeCSV(r.category), escapeCSV(r.barcode),
          escapeCSV(r.requiresPrescription ? 'Sí' : 'No'),
          escapeCSV(r.batchNumber), escapeCSV(fmtDate(r.expiryDate)),
          escapeCSV(r.daysToExpiry), escapeCSV(r.quantityAvailable),
          escapeCSV(r.quantityInitial), escapeCSV(r.unitCost ?? ''),
        ]);
        return toCSV(headers, csvRows);
      }

      return NextResponse.json({ report: 'stock-by-batch', rows, total: rows.length });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2) PRÓXIMOS A VENCER
    // ══════════════════════════════════════════════════════════════════════════
    if (report === 'expiring') {
      if (!batchEnabled) {
        return NextResponse.json({ error: 'Módulo de lotes no activo' }, { status: 403 });
      }

      const cutoff = new Date(Date.now() + alertDays * 86_400_000);

      const batches = await prisma.productBatch.findMany({
        where: {
          storeId,
          active: true,
          quantityAvailable: { gt: 0 },
          expiryDate: { gt: new Date(), lte: cutoff },
        },
        include: {
          storeProduct: {
            include: {
              product: {
                select: {
                  name: true, commercialName: true, genericName: true,
                  concentration: true, laboratory: true, category: true,
                  barcode: true, requiresPrescription: true,
                },
              },
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
      });

      const rows = batches.map((b) => {
        const p = b.storeProduct.product;
        const days = Math.ceil((b.expiryDate.getTime() - Date.now()) / 86_400_000);
        return {
          productName: p.name, commercialName: p.commercialName,
          genericName: p.genericName, concentration: p.concentration,
          laboratory: p.laboratory, category: p.category,
          barcode: p.barcode, requiresPrescription: p.requiresPrescription,
          batchNumber: b.batchNumber, expiryDate: b.expiryDate,
          daysToExpiry: days, quantityAvailable: Number(b.quantityAvailable),
        };
      });

      if (format === 'csv') {
        const headers = [
          'Producto', 'Comercial', 'Genérico', 'Concentración',
          'Laboratorio', 'Categoría', 'Código', 'Rx',
          'Lote', 'Vencimiento', 'Días Rest.', 'Stock Disp.',
        ];
        const csvRows = rows.map((r) => [
          escapeCSV(r.productName), escapeCSV(r.commercialName), escapeCSV(r.genericName),
          escapeCSV(r.concentration), escapeCSV(r.laboratory), escapeCSV(r.category),
          escapeCSV(r.barcode), escapeCSV(r.requiresPrescription ? 'Sí' : 'No'),
          escapeCSV(r.batchNumber), escapeCSV(fmtDate(r.expiryDate)),
          escapeCSV(r.daysToExpiry), escapeCSV(r.quantityAvailable),
        ]);
        return toCSV(headers, csvRows);
      }

      return NextResponse.json({ report: 'expiring', rows, total: rows.length, alertDays });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3) VENCIDOS (con stock)
    // ══════════════════════════════════════════════════════════════════════════
    if (report === 'expired') {
      if (!batchEnabled) {
        return NextResponse.json({ error: 'Módulo de lotes no activo' }, { status: 403 });
      }

      const batches = await prisma.productBatch.findMany({
        where: {
          storeId,
          active: true,
          quantityAvailable: { gt: 0 },
          expiryDate: { lt: new Date() },
        },
        include: {
          storeProduct: {
            include: {
              product: {
                select: {
                  name: true, commercialName: true, genericName: true,
                  concentration: true, laboratory: true, category: true,
                  barcode: true, requiresPrescription: true,
                },
              },
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
      });

      const rows = batches.map((b) => {
        const p = b.storeProduct.product;
        const days = Math.ceil((b.expiryDate.getTime() - Date.now()) / 86_400_000); // negativo
        return {
          productName: p.name, commercialName: p.commercialName,
          genericName: p.genericName, concentration: p.concentration,
          laboratory: p.laboratory, category: p.category,
          barcode: p.barcode, requiresPrescription: p.requiresPrescription,
          batchNumber: b.batchNumber, expiryDate: b.expiryDate,
          daysExpired: Math.abs(days), quantityAvailable: Number(b.quantityAvailable),
        };
      });

      if (format === 'csv') {
        const headers = [
          'Producto', 'Comercial', 'Genérico', 'Concentración',
          'Laboratorio', 'Categoría', 'Código', 'Rx',
          'Lote', 'Vencimiento', 'Días Vencido', 'Stock Disp.',
        ];
        const csvRows = rows.map((r) => [
          escapeCSV(r.productName), escapeCSV(r.commercialName), escapeCSV(r.genericName),
          escapeCSV(r.concentration), escapeCSV(r.laboratory), escapeCSV(r.category),
          escapeCSV(r.barcode), escapeCSV(r.requiresPrescription ? 'Sí' : 'No'),
          escapeCSV(r.batchNumber), escapeCSV(fmtDate(r.expiryDate)),
          escapeCSV(r.daysExpired), escapeCSV(r.quantityAvailable),
        ]);
        return toCSV(headers, csvRows);
      }

      return NextResponse.json({ report: 'expired', rows, total: rows.length });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4) VENTAS POR LABORATORIO
    // ══════════════════════════════════════════════════════════════════════════
    if (report === 'sales-by-lab') {
      // JOIN sale_items → store_products → products_master para obtener laboratorio
      const raw = await prisma.$queryRaw<
        Array<{ laboratory: string | null; total_qty: any; total_amount: any; product_count: any }>
      >`
        SELECT
          pm.laboratory,
          SUM(si.quantity)  AS total_qty,
          SUM(si.subtotal)  AS total_amount,
          COUNT(DISTINCT si.store_product_id) AS product_count
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        INNER JOIN store_products sp ON sp.id = si.store_product_id
        INNER JOIN products_master pm ON pm.id = sp.product_id
        WHERE s.store_id = ${storeId}
          AND s.created_at >= ${fromDate}
          AND s.created_at <= ${toDate}
          AND s.total > 0
          AND si.is_service = false
        GROUP BY pm.laboratory
        ORDER BY total_amount DESC
      `;

      const rows = raw.map((r) => ({
        laboratory: r.laboratory || '(Sin laboratorio)',
        totalQty: Number(r.total_qty),
        totalAmount: Number(r.total_amount),
        productCount: Number(r.product_count),
      }));

      if (format === 'csv') {
        const headers = ['Laboratorio', 'Cantidad vendida', 'Monto total (S/)', 'Productos distintos'];
        const csvRows = rows.map((r) => [
          escapeCSV(r.laboratory), escapeCSV(r.totalQty),
          escapeCSV(r.totalAmount.toFixed(2)), escapeCSV(r.productCount),
        ]);
        return toCSV(headers, csvRows);
      }

      return NextResponse.json({ report: 'sales-by-lab', rows, total: rows.length, dateRange: { from: fromDate, to: toDate } });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5) VENTAS POR GENÉRICO / COMERCIAL
    // ══════════════════════════════════════════════════════════════════════════
    if (report === 'sales-by-generic') {
      const raw = await prisma.$queryRaw<
        Array<{
          product_name: string;
          generic_name: string | null;
          commercial_name: string | null;
          concentration: string | null;
          laboratory: string | null;
          total_qty: any;
          total_amount: any;
        }>
      >`
        SELECT
          pm.name           AS product_name,
          pm.generic_name,
          pm.commercial_name,
          pm.concentration,
          pm.laboratory,
          SUM(si.quantity)  AS total_qty,
          SUM(si.subtotal)  AS total_amount
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        INNER JOIN store_products sp ON sp.id = si.store_product_id
        INNER JOIN products_master pm ON pm.id = sp.product_id
        WHERE s.store_id = ${storeId}
          AND s.created_at >= ${fromDate}
          AND s.created_at <= ${toDate}
          AND s.total > 0
          AND si.is_service = false
        GROUP BY pm.id, pm.name, pm.generic_name, pm.commercial_name, pm.concentration, pm.laboratory
        ORDER BY total_amount DESC
        LIMIT 100
      `;

      const rows = raw.map((r) => ({
        productName: r.product_name,
        genericName: r.generic_name,
        commercialName: r.commercial_name,
        concentration: r.concentration,
        laboratory: r.laboratory,
        totalQty: Number(r.total_qty),
        totalAmount: Number(r.total_amount),
      }));

      if (format === 'csv') {
        const headers = [
          'Producto', 'Genérico (DCI)', 'Comercial', 'Concentración',
          'Laboratorio', 'Cantidad vendida', 'Monto total (S/)',
        ];
        const csvRows = rows.map((r) => [
          escapeCSV(r.productName), escapeCSV(r.genericName), escapeCSV(r.commercialName),
          escapeCSV(r.concentration), escapeCSV(r.laboratory),
          escapeCSV(r.totalQty), escapeCSV(r.totalAmount.toFixed(2)),
        ]);
        return toCSV(headers, csvRows);
      }

      return NextResponse.json({ report: 'sales-by-generic', rows, total: rows.length, dateRange: { from: fromDate, to: toDate } });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6) PRODUCTOS Rx VENDIDOS (audit_logs)
    // ══════════════════════════════════════════════════════════════════════════
    if (report === 'rx-sold') {
      const logs = await prisma.auditLog.findMany({
        where: {
          storeId,
          action: 'RX_PRODUCT_SOLD',
          createdAt: { gte: fromDate, lte: toDate },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      const rows = logs.map((l) => {
        const meta = l.meta as Record<string, any> | null;
        return {
          date: l.createdAt,
          saleId: meta?.saleId || l.entityId,
          productId: meta?.productId,
          cashierId: meta?.cashierId || l.userId,
          patientName: meta?.patientName,
          prescriptionNumber: meta?.prescriptionNumber,
          observation: meta?.observation,
        };
      });

      if (format === 'csv') {
        const headers = [
          'Fecha', 'ID Venta', 'ID Producto', 'ID Cajero',
          'Nombre Paciente', 'Nro Receta', 'Observación',
        ];
        const csvRows = rows.map((r) => [
          escapeCSV(fmtDate(r.date)), escapeCSV(r.saleId), escapeCSV(r.productId),
          escapeCSV(r.cashierId), escapeCSV(r.patientName), escapeCSV(r.prescriptionNumber),
          escapeCSV(r.observation),
        ]);
        return toCSV(headers, csvRows);
      }

      return NextResponse.json({ report: 'rx-sold', rows, total: rows.length, dateRange: { from: fromDate, to: toDate } });
    }

    return NextResponse.json({ error: 'Tipo de reporte no válido' }, { status: 400 });
  } catch (error) {
    console.error('[pharma-reports]', error);
    return NextResponse.json({ error: 'Error al generar reporte' }, { status: 500 });
  }
}
