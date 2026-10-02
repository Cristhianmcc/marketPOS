import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import ExcelJS from 'exceljs';

// ─── helpers ───────────────────────────────────────────────────────────────

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function borders(style: ExcelJS.BorderStyle = 'thin'): Partial<ExcelJS.Borders> {
  const b: ExcelJS.Border = { style, color: { argb: 'FFBFBFBF' } };
  return { top: b, left: b, bottom: b, right: b };
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    value?: ExcelJS.CellValue;
    bg?: string;
    bold?: boolean;
    color?: string;
    size?: number;
    halign?: ExcelJS.Alignment['horizontal'];
    border?: Partial<ExcelJS.Borders>;
    numFmt?: string;
    italic?: boolean;
  },
) {
  if (opts.value !== undefined) cell.value = opts.value;
  if (opts.bg)     cell.fill   = fill(opts.bg);
  if (opts.border) cell.border = opts.border;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  cell.font = {
    bold:   opts.bold   ?? false,
    italic: opts.italic ?? false,
    color:  { argb: opts.color ?? 'FF1F2937' },
    size:   opts.size   ?? 10,
    name:   'Calibri',
  };
  cell.alignment = {
    vertical:   'middle',
    horizontal: opts.halign ?? 'left',
    indent:     1,
    wrapText:   false,
  };
}

// ─── colores ───────────────────────────────────────────────────────────────

const C = {
  navy:    'FF1F3864',
  teal:    'FF1F6B75',
  blue:    'FF2E75B6',
  hdr:     'FFD6DCE4',
  altRow:  'FFF0F7FF',
  white:   'FFFFFFFF',
  green:   'FFE2EFDA',
  greenDk: 'FF375623',
  red:     'FFFFCCCC',
  redDk:   'FF8B0000',
  subHdr:  'FFE8F4F8',
  detHdr:  'FFDCE6F1',
  detRow:  'FFF8FBFF',
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', CARD: 'Tarjeta', CREDIT: 'Fiado', FIADO: 'Fiado', MIXED: 'Mixto',
};
const getMixedLabel = (sale: any, detailed = false) => {
  if (sale.paymentMethod === 'MIXED' && sale.paymentDetails?.splits?.length) {
    if (detailed) {
      return sale.paymentDetails.splits
        .filter((s: any) => s.amount > 0)
        .map((s: any) => `${METHOD_LABEL[s.method] || s.method}: ${s.amount.toFixed(2)}`)
        .join(' / ');
    }
    return sale.paymentDetails.splits.map((s: any) => METHOD_LABEL[s.method] || s.method).join('/');
  }
  return METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod;
};
const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Propietario', ADMIN: 'Administrador', CASHIER: 'Cajero',
};

// ─── handler ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from    = searchParams.get('from');
    const to      = searchParams.get('to');
    const shiftId = searchParams.get('shiftId');

    const where: any = {
      storeId:  session.storeId,
      closedAt: { not: null },
    };

    if (shiftId) {
      where.id = shiftId;
    } else {
      if (from) where.openedAt = { ...where.openedAt, gte: new Date(from + 'T00:00:00.000-05:00') };
      if (to)   where.closedAt = { ...where.closedAt, lte: new Date(to   + 'T23:59:59.999-05:00') };
    }

    if (session.role === 'CASHIER') where.openedById = session.userId;

    const [store, currentUser, shifts] = await Promise.all([
      prisma.store.findUnique({
        where:  { id: session.storeId! },
        select: { name: true, ruc: true, address: true },
      }),
      prisma.user.findUnique({
        where:  { id: session.userId },
        select: { name: true, role: true },
      }),
      prisma.shift.findMany({
        where,
        include: {
          openedBy: { select: { name: true } },
          closedBy: { select: { name: true } },
          sales: {
            where:   { total: { gt: 0 } },
            include: {
              user: { select: { name: true } },
              items: {
                include: {
                  storeProduct: {
                    select: {
                      stock: true,
                      product: { select: { name: true, category: true } },
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { openedAt: 'desc' },
      }),
    ]);

    // ─── Workbook ──────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = currentUser?.name ?? 'MarketPOS';
    wb.created = new Date();

    const ws = wb.addWorksheet('Turnos', {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    });

    // Anchos de columna: 10 columnas para tabla de turnos + columna Productos (col 11)
    // Col:   1     2     3     4     5     6     7     8     9     10    11
    // Name: Aper  Cierr Cajer CajIn EfEsp CajFn Difer NVent TotV  Notas Prod
    const colWidths = [18, 18, 18, 12, 12, 12, 12, 9, 13, 22, 45];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const TOTAL_COLS = colWidths.length; // 11

    // ══════════════════════════════════════════════════════════════════════
    // SECCIÓN 1 – TÍTULO
    // ══════════════════════════════════════════════════════════════════════
    ws.getRow(1).height = 6;
    ws.getRow(2).height = 30;
    ws.mergeCells(2, 1, 2, TOTAL_COLS);
    styleCell(ws.getCell(2, 1), {
      value:  shiftId ? 'DETALLE DE TURNO' : 'REPORTE DE TURNOS',
      bg:     C.navy, bold: true, color: C.white, size: 16, halign: 'center',
      border: borders('thin'),
    });
    ws.getRow(3).height = 8;

    // ══════════════════════════════════════════════════════════════════════
    // SECCIÓN 2 – INFO EMPRESA (cols 1-3) + AUDITORÍA (cols 5-7)
    // ══════════════════════════════════════════════════════════════════════
    const exportDate  = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const periodLabel = shiftId
      ? 'Turno específico'
      : (from && to ? `${from} al ${to}` : from ? `desde ${from}` : to ? `hasta ${to}` : 'Todos');

    const leftItems:  [string, string][] = [
      ['Tienda',    store?.name    ?? ''],
      ['RUC',       store?.ruc     ?? ''],
      ['Dirección', store?.address ?? ''],
    ];
    const rightItems: [string, string][] = [
      ['Exportado por',     currentUser?.name ?? ''],
      ['Cargo',             ROLE_LABEL[currentUser?.role ?? ''] ?? ''],
      ['Fecha exportación', exportDate],
      ['Período',           periodLabel],
      ['N° Turnos',         String(shifts.length)],
    ];
    const infoRows = Math.max(leftItems.length, rightItems.length);

    ws.getRow(4).height = 18;
    ws.mergeCells(4, 1, 4, 3);
    styleCell(ws.getCell(4, 1), {
      value: 'DATOS DE LA EMPRESA', bg: C.navy, bold: true, color: C.white, size: 11, border: borders('thin'),
    });
    ws.mergeCells(4, 5, 4, 7);
    styleCell(ws.getCell(4, 5), {
      value: 'AUDITORÍA DE EXPORTACIÓN', bg: C.teal, bold: true, color: C.white, size: 11, border: borders('thin'),
    });

    for (let i = 0; i < infoRows; i++) {
      const r = 5 + i;
      ws.getRow(r).height = 16;
      if (i < leftItems.length) {
        const [k, v] = leftItems[i];
        ws.mergeCells(r, 1, r, 2);
        styleCell(ws.getCell(r, 1), { value: k, bg: 'FFF0F5FF', bold: true,  border: borders('hair') });
        styleCell(ws.getCell(r, 3), { value: v, bg: C.white,    bold: false, border: borders('hair') });
      }
      if (i < rightItems.length) {
        const [k, v] = rightItems[i];
        ws.mergeCells(r, 5, r, 6);
        styleCell(ws.getCell(r, 5), { value: k, bg: 'FFF0F5FF', bold: true,  border: borders('hair') });
        styleCell(ws.getCell(r, 7), { value: v, bg: C.white,    bold: false, border: borders('hair') });
      }
    }

    let row = 5 + infoRows;
    ws.getRow(row).height = 8; row++;

    // ══════════════════════════════════════════════════════════════════════
    // SECCIÓN 3 – TABLA DE TURNOS
    // ══════════════════════════════════════════════════════════════════════
    const shiftHeaders = [
      'Apertura', 'Cierre', 'Cajero', 'Caja Inicial', 'Ef. Esperado',
      'Caja Final', 'Diferencia', 'N° Ventas', 'Total Vendido', 'Notas', 'Productos más vendidos',
    ];

    // Cabecera de tabla
    ws.getRow(row).height = 20;
    shiftHeaders.forEach((h, ci) => {
      styleCell(ws.getCell(row, ci + 1), {
        value: h, bg: C.teal, bold: true, color: C.white,
        halign: 'center', border: borders('thin'), size: 10,
      });
    });
    row++;

    // Filas de turnos + detalle de ventas
    for (let si = 0; si < shifts.length; si++) {
      const shift      = shifts[si];
      const isAlt      = si % 2 === 0;
      const shiftBg    = isAlt ? C.white : C.altRow;
      const totalVend  = shift.sales.reduce((sum: number, v: any) => sum + Number(v.total), 0);
      const diff       = shift.difference ? Number(shift.difference) : 0;
      const diffPositive = diff >= 0;

      // Resumir productos más vendidos por este turno
      const productCount: Record<string, number> = {};
      for (const sale of shift.sales) {
        for (const item of (sale as any).items ?? []) {
          const name = item.isService
            ? (item.serviceName ?? 'Servicio')
            : (item.storeProduct?.product?.name ?? item.productName ?? '?');
          productCount[name] = (productCount[name] ?? 0) + Number(item.quantity);
        }
      }
      const topProducts = Object.entries(productCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, qty]) => `${name} (${qty % 1 === 0 ? qty : qty.toFixed(2)})`)
        .join(', ');

      ws.getRow(row).height = 16;
      const shiftVals: (string | number)[] = [
        new Date(shift.openedAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }),
        shift.closedAt ? new Date(shift.closedAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '',
        shift.openedBy.name,
        Number(shift.openingCash),
        shift.expectedCash ? Number(shift.expectedCash) : '',
        shift.closingCash  ? Number(shift.closingCash)  : '',
        diff,
        shift.sales.length,
        totalVend,
        shift.notes ?? '',
        topProducts,
      ];

      shiftVals.forEach((v, ci) => {
        const isNumeric = typeof v === 'number';
        const isDiff    = ci === 6;
        const cellBg    = isDiff
          ? (diffPositive ? C.green : C.red)
          : shiftBg;
        const cellColor = isDiff
          ? (diffPositive ? C.greenDk : C.redDk)
          : 'FF1F2937';
        styleCell(ws.getCell(row, ci + 1), {
          value:  v,
          bg:     cellBg,
          color:  cellColor,
          bold:   ci === 8, // negrita en Total Vendido
          border: borders('thin'),
          halign: isNumeric ? 'right' : 'left',
          numFmt: isNumeric ? '#,##0.00' : undefined,
        });
      });
      row++;

      // Sub-tabla de ventas del turno
      if (shift.sales.length > 0) {
        // Cabecera del bloque de detalle
        ws.getRow(row).height = 14;
        ws.mergeCells(row, 1, row, TOTAL_COLS);
        styleCell(ws.getCell(row, 1), {
          value:  `  ▸ Detalle de ventas — ${shift.openedBy.name}  (${shift.sales.length} tickets)`,
          bg:     C.detHdr, bold: true, color: C.navy, size: 9,
          border: borders('thin'),
        });
        row++;

        // Cabecera de columnas de detalle
        ws.getRow(row).height = 13;
        const detailHeaders = ['', 'Ticket', 'Hora', 'Método', 'Total (S/)', 'Productos'];
        detailHeaders.forEach((h, ci) => {
          const span = ci === 5 ? TOTAL_COLS - 5 : 1; // última col abarca hasta el final
          if (ci === 5) {
            ws.mergeCells(row, 6, row, TOTAL_COLS);
          }
          styleCell(ws.getCell(row, ci + 1), {
            value: h, bg: C.detHdr, bold: true, size: 9,
            halign: ci === 4 ? 'right' : 'center',
            border: borders('hair'),
          });
        });
        row++;

        // Filas de ventas
        for (let vi = 0; vi < shift.sales.length; vi++) {
          const sale    = shift.sales[vi] as any;
          const detBg   = vi % 2 === 0 ? C.white : C.detRow;
          const products = sale.items.map((item: any) => {
            const name = item.isService
              ? (item.serviceName ?? 'Servicio')
              : (item.storeProduct?.product?.name ?? item.productName ?? '?');
            const qty = Number(item.quantity);
            return `${name} x${qty % 1 === 0 ? qty : qty.toFixed(3)}`;
          }).join('  |  ');

          ws.getRow(row).height = 13;

          styleCell(ws.getCell(row, 1), { bg: detBg, border: borders('hair') }); // indent
          styleCell(ws.getCell(row, 2), { value: sale.saleNumber ?? '', bg: detBg, border: borders('hair'), halign: 'center', size: 9 });
          styleCell(ws.getCell(row, 3), {
            value: new Date(sale.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }),
            bg: detBg, border: borders('hair'), halign: 'center', size: 9,
          });
          styleCell(ws.getCell(row, 4), {
            value: getMixedLabel(sale, true),
            bg: detBg, border: borders('hair'), halign: 'center', size: 9,
          });
          styleCell(ws.getCell(row, 5), {
            value: Number(sale.total), bg: detBg, border: borders('hair'),
            halign: 'right', numFmt: '#,##0.00', size: 9,
          });
          ws.mergeCells(row, 6, row, TOTAL_COLS);
          styleCell(ws.getCell(row, 6), {
            value: products, bg: detBg, border: borders('hair'), size: 9, italic: true,
          });
          row++;
        }

        // Línea de subtotal del turno
        ws.getRow(row).height = 14;
        ws.mergeCells(row, 1, row, 4);
        styleCell(ws.getCell(row, 1), {
          value: `  Total turno: ${shift.sales.length} ticket${shift.sales.length !== 1 ? 's' : ''}`,
          bg: C.teal, bold: true, color: C.white, size: 9, border: borders('thin'),
        });
        styleCell(ws.getCell(row, 5), {
          value: totalVend, bg: C.teal, bold: true, color: C.white,
          halign: 'right', numFmt: '#,##0.00', size: 9, border: borders('thin'),
        });
        ws.mergeCells(row, 6, row, TOTAL_COLS);
        styleCell(ws.getCell(row, 6), { bg: C.teal, border: borders('thin') });
        row++;

        // Separador entre turnos
        ws.getRow(row).height = 6; row++;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECCIÓN 4 – RESUMEN GLOBAL
    // ══════════════════════════════════════════════════════════════════════
    ws.getRow(row).height = 10; row++;

    ws.getRow(row).height = 20;
    ws.mergeCells(row, 1, row, TOTAL_COLS);
    styleCell(ws.getCell(row, 1), {
      value: 'RESUMEN GLOBAL', bg: C.navy, bold: true, color: C.white,
      size: 12, halign: 'center', border: borders('thin'),
    });
    row++;

    const grandTotal  = shifts.reduce((s, sh) => s + sh.sales.reduce((ss: number, v: any) => ss + Number(v.total), 0), 0);
    const grandSales  = shifts.reduce((s, sh) => s + sh.sales.length, 0);

    // Descomponer montos reales por método (MIXED se separa en sus splits)
    const methodTotals: Record<string, number> = {};

    for (const shift of shifts) {
      for (const sale of shift.sales) {
        const s = sale as any;
        const method = s.paymentMethod || 'OTROS';

        if (method === 'MIXED' && s.paymentDetails?.splits?.length) {
          for (const split of s.paymentDetails.splits) {
            if (split.method && split.amount > 0) {
              methodTotals[split.method] = (methodTotals[split.method] ?? 0) + split.amount;
            }
          }
        } else {
          methodTotals[method] = (methodTotals[method] ?? 0) + Number(s.total);
        }
      }
    }

    const summaryItems: [string, string | number][] = [
      ['N° Turnos exportados',  shifts.length],
      ['N° Ventas totales',     grandSales],
      ['TOTAL FACTURADO',       grandTotal],
      ...Object.entries(methodTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([m, t]): [string, number] => [`  ${METHOD_LABEL[m] ?? m}`, t]),
    ];

    for (let i = 0; i < summaryItems.length; i++) {
      const [label, value] = summaryItems[i];
      const isTotals = label === 'TOTAL FACTURADO';
      const bg       = isTotals ? C.green : (i % 2 === 0 ? C.white : C.altRow);
      ws.getRow(row).height = 15;
      ws.mergeCells(row, 1, row, 4);
      styleCell(ws.getCell(row, 1), { value: label, bg, bold: isTotals, border: isTotals ? borders('medium') : borders('hair') });
      ws.mergeCells(row, 5, row, 6);
      styleCell(ws.getCell(row, 5), {
        value:  typeof value === 'number' ? value : value,
        bg, bold: isTotals, halign: 'right',
        numFmt: typeof value === 'number' && i > 1 ? '#,##0.00' : undefined,
        border: isTotals ? borders('medium') : borders('hair'),
      });
      ws.mergeCells(row, 7, row, TOTAL_COLS);
      styleCell(ws.getCell(row, 7), { bg, border: borders('hair') });
      row++;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HOJA 2 – PRODUCTOS VENDIDOS (consolidado con stock actual)
    // ═══════════════════════════════════════════════════════════════════════
    const wsProds = wb.addWorksheet('Productos Vendidos', {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait' },
    });
    [20, 12, 12, 14, 14, 14, 16].forEach((w, i) => { wsProds.getColumn(i + 1).width = w; });

    // Título hoja 2
    wsProds.getRow(1).height = 6;
    wsProds.getRow(2).height = 28;
    wsProds.mergeCells(2, 1, 2, 7);
    styleCell(wsProds.getCell(2, 1), {
      value: 'PRODUCTOS VENDIDOS EN EL PERÍODO',
      bg: C.navy, bold: true, color: C.white, size: 14, halign: 'center', border: borders('thin'),
    });
    wsProds.getRow(3).height = 8;

    // Encabezados
    wsProds.getRow(4).height = 14;
    const prodHeaders = ['Producto', 'Categoría', 'Cant. Vendida', 'Total Recaudado (S/)', 'Stock Inicial', 'Stock Actual', 'Estado Stock'];
    prodHeaders.forEach((h, ci) => {
      styleCell(wsProds.getCell(4, ci + 1), {
        value: h, bg: C.teal, bold: true, color: C.white, size: 10,
        halign: ci >= 2 ? 'center' : 'left', border: borders('thin'),
      });
    });

    // Consolidar productos vendidos en todos los turnos
    const productSummary: Record<string, { name: string; category: string; qtySold: number; revenue: number; stock: number | null }> = {};
    for (const shift of shifts) {
      for (const sale of shift.sales as any[]) {
        for (const item of sale.items ?? []) {
          if (item.isFreeItem || !item.storeProduct || item.isService) continue;
          const name = item.storeProduct?.product?.name ?? item.productName ?? '?';
          const key = name.toLowerCase();
          if (!productSummary[key]) {
            productSummary[key] = {
              name,
              category: item.storeProduct?.product?.category ?? 'Otros',
              qtySold: 0,
              revenue: 0,
              stock: item.storeProduct?.stock !== undefined ? Number(item.storeProduct.stock) : null,
            };
          }
          productSummary[key].qtySold += Number(item.quantity);
          productSummary[key].revenue += Number(item.totalLine ?? item.subtotal ?? 0);
        }
      }
    }

    const sortedProds = Object.values(productSummary).sort((a, b) => b.qtySold - a.qtySold);
    let pRow = 5;
    for (let i = 0; i < sortedProds.length; i++) {
      const p = sortedProds[i];
      const bg = i % 2 === 0 ? C.white : C.altRow;
      const stockNum = p.stock;
      const stockInicial = stockNum !== null ? stockNum + p.qtySold : null;
      const stockLabel = stockNum === null ? 'Sin control' : stockNum <= 0 ? '⚠ Sin stock' : stockNum <= 5 ? '⚠ Stock bajo' : '✓ OK';
      const stockBg = stockNum === null ? bg : stockNum <= 0 ? 'FFFEE2E2' : stockNum <= 5 ? 'FFFEF9C3' : bg;

      wsProds.getRow(pRow).height = 14;
      styleCell(wsProds.getCell(pRow, 1), { value: p.name, bg, border: borders('hair'), size: 10 });
      styleCell(wsProds.getCell(pRow, 2), { value: p.category, bg, border: borders('hair'), size: 10 });
      styleCell(wsProds.getCell(pRow, 3), { value: p.qtySold, bg, border: borders('hair'), halign: 'center', size: 10, numFmt: '#,##0' });
      styleCell(wsProds.getCell(pRow, 4), { value: p.revenue, bg, border: borders('hair'), halign: 'right', size: 10, numFmt: '#,##0.00' });
      styleCell(wsProds.getCell(pRow, 5), { value: stockInicial ?? 'N/A', bg, border: borders('hair'), halign: 'center', size: 10, numFmt: typeof stockInicial === 'number' ? '#,##0' : undefined });
      styleCell(wsProds.getCell(pRow, 6), { value: stockNum ?? 'N/A', bg: stockBg, border: borders('hair'), halign: 'center', size: 10, numFmt: typeof stockNum === 'number' ? '#,##0' : undefined });
      styleCell(wsProds.getCell(pRow, 7), { value: stockLabel, bg: stockBg, border: borders('hair'), halign: 'center', size: 10, bold: stockNum !== null && stockNum <= 5 });
      pRow++;
    }
    if (sortedProds.length === 0) {
      wsProds.mergeCells(5, 1, 5, 7);
      styleCell(wsProds.getCell(5, 1), { value: 'No hay productos registrados en este período', halign: 'center', size: 10 });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HOJA 3 – VENTAS LIBRES (productos no registrados en inventario)
    // ═══════════════════════════════════════════════════════════════════════
    const wsFree = wb.addWorksheet('Ventas Libres', {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait' },
    });
    [22, 18, 10, 12, 14, 22].forEach((w, i) => { wsFree.getColumn(i + 1).width = w; });

    wsFree.getRow(1).height = 6;
    wsFree.getRow(2).height = 28;
    wsFree.mergeCells(2, 1, 2, 6);
    styleCell(wsFree.getCell(2, 1), {
      value: 'VENTAS LIBRES (productos sin registro en inventario)',
      bg: 'FFEA580C', bold: true, color: C.white, size: 13, halign: 'center', border: borders('thin'),
    });
    wsFree.getRow(3).height = 8;

    wsFree.getRow(4).height = 14;
    const freeHeaders = ['Descripción', 'Cajero', 'Cant.', 'Precio Unit. (S/)', 'Total (S/)', 'Fecha / Ticket'];
    freeHeaders.forEach((h, ci) => {
      styleCell(wsFree.getCell(4, ci + 1), {
        value: h, bg: 'FFEA580C', bold: true, color: C.white, size: 10,
        halign: ci >= 2 ? 'center' : 'left', border: borders('thin'),
      });
    });

    let fRow = 5;
    let freeTotalAmount = 0;
    let freeTotalItems = 0;
    for (const shift of shifts) {
      for (const sale of shift.sales as any[]) {
        for (const item of sale.items ?? []) {
          if (!item.isFreeItem && item.productContent !== '(Venta libre)') continue;
          const name = item.productName ?? item.storeProduct?.product?.name ?? 'Producto libre';
          const qty = Number(item.quantity);
          const unitPrice = Number(item.unitPrice);
          const total = Number(item.totalLine ?? item.subtotal ?? unitPrice * qty);
          const bg = fRow % 2 === 0 ? C.white : C.altRow;
          const cashier = (sale as any).user?.name ?? shift.openedBy?.name ?? 'Cajero';
          const fecha = new Date(sale.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' });

          wsFree.getRow(fRow).height = 14;
          styleCell(wsFree.getCell(fRow, 1), { value: name, bg, border: borders('hair'), size: 10 });
          styleCell(wsFree.getCell(fRow, 2), { value: cashier, bg, border: borders('hair'), size: 10 });
          styleCell(wsFree.getCell(fRow, 3), { value: qty, bg, border: borders('hair'), halign: 'center', size: 10, numFmt: '#,##0' });
          styleCell(wsFree.getCell(fRow, 4), { value: unitPrice, bg, border: borders('hair'), halign: 'right', size: 10, numFmt: '#,##0.00' });
          styleCell(wsFree.getCell(fRow, 5), { value: total, bg, border: borders('hair'), halign: 'right', size: 10, numFmt: '#,##0.00', bold: true });
          styleCell(wsFree.getCell(fRow, 6), { value: `#${sale.saleNumber ?? ''} — ${fecha}`, bg, border: borders('hair'), size: 9, italic: true });
          freeTotalAmount += total;
          freeTotalItems++;
          fRow++;
        }
      }
    }

    if (freeTotalItems === 0) {
      wsFree.mergeCells(5, 1, 5, 6);
      styleCell(wsFree.getCell(5, 1), { value: 'No hubo ventas libres en este período', halign: 'center', size: 10 });
    } else {
      // Fila de total
      wsFree.getRow(fRow).height = 15;
      wsFree.mergeCells(fRow, 1, fRow, 4);
      styleCell(wsFree.getCell(fRow, 1), { value: `Total ventas libres: ${freeTotalItems} item(s)`, bg: 'FFEA580C', bold: true, color: C.white, border: borders('thin'), size: 10 });
      styleCell(wsFree.getCell(fRow, 5), { value: freeTotalAmount, bg: 'FFEA580C', bold: true, color: C.white, halign: 'right', numFmt: '#,##0.00', border: borders('thin'), size: 10 });
      wsFree.mergeCells(fRow, 6, fRow, 6);
      styleCell(wsFree.getCell(fRow, 6), { bg: 'FFEA580C', border: borders('thin') });
    }

    // ─── buffer ──────────────────────────────────────────────────────────
    const buffer  = await wb.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split('T')[0];
    const fname   = shiftId ? `turno_${dateStr}.xlsx` : `turnos_${dateStr}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fname}"`,
      },
    });

  } catch (error) {
    console.error('Error exporting shifts XLSX:', error);
    return NextResponse.json({ code: 'SERVER_ERROR', message: 'Error al exportar turnos' }, { status: 500 });
  }
}
