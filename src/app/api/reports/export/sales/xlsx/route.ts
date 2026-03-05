import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import ExcelJS from 'exceljs';

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    indent?: number;
  },
) {
  if (opts.value !== undefined) cell.value = opts.value;
  if (opts.bg)     cell.fill   = fill(opts.bg);
  if (opts.border) cell.border = opts.border;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  cell.font = {
    bold:  opts.bold  ?? false,
    color: { argb: opts.color ?? 'FF1F2937' },
    size:  opts.size  ?? 10,
    name:  'Calibri',
  };
  cell.alignment = {
    vertical:   'middle',
    horizontal: opts.halign ?? 'left',
    indent:     opts.indent ?? 1,
    wrapText:   false,
  };
}

function border(style: ExcelJS.BorderStyle = 'thin'): ExcelJS.Border {
  return { style, color: { argb: 'FFBFBFBF' } };
}

function allBorders(style: ExcelJS.BorderStyle = 'thin'): Partial<ExcelJS.Borders> {
  const b = border(style);
  return { top: b, left: b, bottom: b, right: b };
}

function bottomBorder(style: ExcelJS.BorderStyle = 'medium'): Partial<ExcelJS.Borders> {
  return { bottom: { style } };
}

function applyRange(
  ws: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  style: Partial<ExcelJS.Style>,
) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c);
      if (style.fill)      cell.fill      = style.fill      as ExcelJS.Fill;
      if (style.font)      cell.font      = style.font;
      if (style.alignment) cell.alignment = style.alignment;
      if (style.border)    cell.border    = style.border;
    }
  }
}

// â”€â”€â”€ colores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const C = {
  navy:   'FF1F3864',
  blue:   'FF2E75B6',
  hdr:    'FFD6DCE4',
  altRow: 'FFF0F7FF',
  green:  'FFE2EFDA',
  white:  'FFFFFFFF',
  dark:   'FF1F2937',
  methods: {
    CASH:   { bg: 'FF375623', lt: 'FFE2EFDA' },
    YAPE:   { bg: 'FF4B0082', lt: 'FFF3E8FF' },
    PLIN:   { bg: 'FF006080', lt: 'FFE0F4FF' },
    CARD:   { bg: 'FF7D4607', lt: 'FFFFF0D0' },
    CREDIT: { bg: 'FF8B0000', lt: 'FFFFE0E0' },
    OTROS:  { bg: 'FF595959', lt: 'FFF5F5F5' },
  } as Record<string, { bg: string; lt: string }>,
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', CARD: 'Tarjeta', CREDIT: 'Fiado',
};
const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Propietario', ADMIN: 'Administrador', CASHIER: 'Cajero',
};

// â”€â”€â”€ handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to');

    const where: any = { storeId: session.storeId, total: { gt: 0 } };
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(from + 'T00:00:00.000-05:00') };
    if (to)   where.createdAt = { ...where.createdAt, lte: new Date(to   + 'T23:59:59.999-05:00') };
    if (session.role === 'CASHIER') where.userId = session.userId;

    const [store, currentUser] = await Promise.all([
      prisma.store.findUnique({
        where: { id: session.storeId! },
        select: { name: true, ruc: true, address: true },
      }),
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { name: true, role: true },
      }),
    ]);

    const sales = await prisma.sale.findMany({
      where,
      include: {
        user:     { select: { name: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // â”€â”€ estadÃ­sticas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const hasCoupons = sales.some(s => s.couponCode && Number(s.couponDiscount) > 0);

    const paymentGroups: Record<string, typeof sales> = {};
    const paymentSummary: Record<string, { count: number; total: number }> = {};
    let grandTotal = 0, grandSubtotal = 0, grandDiscount = 0, grandCouponDiscount = 0, grandTax = 0;

    for (const s of sales) {
      const m = s.paymentMethod || 'OTROS';
      if (!paymentSummary[m]) { paymentSummary[m] = { count: 0, total: 0 }; paymentGroups[m] = []; }
      paymentSummary[m].count += 1;
      paymentSummary[m].total += Number(s.total);
      paymentGroups[m].push(s);
      grandTotal          += Number(s.total);
      grandSubtotal       += Number(s.subtotal);
      grandDiscount       += Number(s.discountTotal);
      grandCouponDiscount += Number(s.couponDiscount);
      grandTax            += Number(s.tax);
    }

    const methodEntries = Object.entries(paymentSummary).sort((a, b) => b[1].total - a[1].total);
    const exportDate  = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const periodLabel = from && to ? `${from} al ${to}` : from ? `desde ${from}` : to ? `hasta ${to}` : 'Todos';

    // â”€â”€ workbook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const wb = new ExcelJS.Workbook();
    wb.creator = currentUser?.name ?? 'MarketPOS';
    wb.created = new Date();

    const ws = wb.addWorksheet('Ventas', {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    });

    // â”€â”€ anchos de columna â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const dataCols = hasCoupons ? 14 : 13;
    const tableColWidths = [8, 12, 10, 10, 11, ...(hasCoupons ? [24] : []), 10, 11, 13, 10, 10, 20, 14, 9];
    tableColWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const nMethods = methodEntries.length;
    // cada mÃ©todo ocupa 3 cols, separado por 1 col vacÃ­a: 4, 8, 12...
    const mColStart = (idx: number) => 4 + idx * 4;
    const lastSummaryCol = mColStart(nMethods - 1) + 2;
    const totalCols = Math.max(dataCols, lastSummaryCol);

    // anchos resumen
    ws.getColumn(1).width = 18; ws.getColumn(2).width = 12;
    ws.getColumn(3).width = 3;
    for (let idx = 0; idx < nMethods; idx++) {
      const sc = mColStart(idx);
      ws.getColumn(sc).width     = 11;
      ws.getColumn(sc + 1).width = 12;
      ws.getColumn(sc + 2).width = 12;
      if (sc + 3 <= totalCols + 2) ws.getColumn(sc + 3).width = 3; // separador
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // SECCIÃ“N 1 â€” TÃTULO
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    ws.getRow(1).height = 6;
    ws.getRow(2).height = 30;
    ws.mergeCells(2, 1, 2, totalCols);
    styleCell(ws.getCell(2, 1), {
      value: 'REPORTE AUDITORÍA DE VENTAS',
      bg: C.navy, bold: true, color: C.white, size: 16, halign: 'center', border: borders('thin'),
    });
    ws.getRow(3).height = 8;

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // SECCIÓN 2 – INFO EMPRESA (cols 1-2) + AUDITORÍA (cols 4-5) – MISMAS FILAS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      ['Total registros',   String(sales.length)],
    ];
    const infoRows = Math.max(leftItems.length, rightItems.length);

    // Fila 4: cabeceras de bloque
    ws.getRow(4).height = 18;
    ws.mergeCells(4, 1, 4, 2);
    styleCell(ws.getCell(4, 1), { value: 'DATOS DE LA EMPRESA',     bg: C.navy, bold: true, color: C.white, size: 11, border: borders('thin') });
    ws.mergeCells(4, 4, 4, 5);
    styleCell(ws.getCell(4, 4), { value: 'AUDITORÍA DE EXPORTACIÓN', bg: C.blue, bold: true, color: C.white, size: 11, border: borders('thin') });

    // Filas 5..(4+infoRows): datos â€” ambos bloques en la MISMA fila
    for (let i = 0; i < infoRows; i++) {
      const r = 5 + i;
      ws.getRow(r).height = 16;
      if (i < leftItems.length) {
        const [k, v] = leftItems[i];
        styleCell(ws.getCell(r, 1), { value: k, bg: 'FFF0F5FF', bold: true,  border: borders('hair') });
        styleCell(ws.getCell(r, 2), { value: v, bg: C.white,    bold: false, border: borders('hair') });
      }
      if (i < rightItems.length) {
        const [k, v] = rightItems[i];
        styleCell(ws.getCell(r, 4), { value: k, bg: 'FFF0F5FF', bold: true,  border: borders('hair') });
        styleCell(ws.getCell(r, 5), { value: v, bg: C.white,    bold: false, border: borders('hair') });
      }
    }

    let row = 5 + infoRows; // cursor apunta al primer row libre despuÃ©s del bloque info
    ws.getRow(row).height = 8; row++; // separador

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // SECCIÃ“N 3 â€” TABLA DE VENTAS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const tableHeaders = [
      'Ticket', 'Fecha', 'Hora', 'Subtotal', 'Descuentos',
      ...(hasCoupons ? ['CupÃ³n'] : []),
      'Impuesto', 'Total', 'Método Pago', 'Pagado', 'Vuelto', 'Cliente', 'Cajero', 'Impreso',
    ];

    // Cabecera de tabla
    ws.getRow(row).height = 20;
    tableHeaders.forEach((h, ci) => {
      styleCell(ws.getCell(row, ci + 1), {
        value: h, bg: C.blue, bold: true, color: C.white,
        halign: 'center', border: borders('thin'), size: 10,
      });
    });
    row++;

    // Filas de datos â€” usando getRow/getCell directamente (sin addRow)
    for (let i = 0; i < sales.length; i++) {
      const s     = sales[i];
      const rowBg = i % 2 === 0 ? C.white : C.altRow;
      ws.getRow(row).height = 15;

      const vals: (string | number)[] = [
        s.saleNumber ?? '',
        new Date(s.createdAt).toLocaleDateString('es-PE'),
        new Date(s.createdAt).toLocaleTimeString('es-PE'),
        Number(s.subtotal),
        Number(s.discountTotal),
        ...(hasCoupons
          ? [s.couponCode ? `${s.couponCode} (-S/${Number(s.couponDiscount).toFixed(2)})` : '']
          : []),
        Number(s.tax),
        Number(s.total),
        METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod,
        s.amountPaid   !== null ? Number(s.amountPaid)   : '',
        s.changeAmount !== null ? Number(s.changeAmount) : '',
        s.customer?.name ?? '',
        s.user.name,
        s.printedAt ? 'SÃ­' : 'No',
      ];

      vals.forEach((v, ci) => {
        styleCell(ws.getCell(row, ci + 1), {
          value:  v,
          bg:     rowBg,
          border: borders('hair'),
          halign: typeof v === 'number' ? 'right' : 'left',
          numFmt: typeof v === 'number' ? '#,##0.00' : undefined,
        });
      });
      row++;
    }

    // LÃ­nea inferior de tabla
    ws.getRow(row).height = 4;
    for (let c = 1; c <= dataCols; c++) {
      ws.getCell(row, c).border = { bottom: { style: 'medium', color: { argb: C.navy } } };
    }
    row++;
    ws.getRow(row).height = 10; row++; // separador

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // SECCIÃ“N 4 â€” RESUMEN HORIZONTAL
    // Col 1-2: Resumen | Col 4-6: mÃ©todo1 | Col 8-10: mÃ©todo2 ... (mismas filas)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // â€” Fila de cabeceras de secciÃ³n â€”
    ws.getRow(row).height = 18;
    ws.mergeCells(row, 1, row, 2);
    styleCell(ws.getCell(row, 1), {
      value: 'RESUMEN GENERAL', bg: C.navy, bold: true, color: C.white, size: 11, border: borders('thin'),
    });
    methodEntries.forEach(([method], idx) => {
      const mc     = mColStart(idx);
      const colors = C.methods[method] ?? C.methods.OTROS;
      ws.mergeCells(row, mc, row, mc + 2);
      styleCell(ws.getCell(row, mc), {
        value: `VENTAS - ${(METHOD_LABEL[method] ?? method).toUpperCase()}`,
        bg: colors.bg, bold: true, color: C.white, size: 11, border: borders('thin'),
      });
    });
    row++;

    // â€” Sub-cabeceras de columnas â€”
    ws.getRow(row).height = 16;
    styleCell(ws.getCell(row, 1), { value: 'Concepto',   bg: C.hdr, bold: true, border: borders('thin'), halign: 'center' });
    styleCell(ws.getCell(row, 2), { value: 'Monto (S/)', bg: C.hdr, bold: true, border: borders('thin'), halign: 'center' });
    methodEntries.forEach(([method], idx) => {
      const mc     = mColStart(idx);
      const colors = C.methods[method] ?? C.methods.OTROS;
      ['NÂ° Ticket', 'Fecha', 'Total (S/)'].forEach((h, hi) => {
        styleCell(ws.getCell(row, mc + hi), {
          value: h, bg: colors.lt, bold: true, border: borders('thin'),
          halign: hi === 2 ? 'right' : 'center',
        });
      });
    });
    row++;

    // â€” Filas de datos: resumen izquierdo + mÃ©todos derecha, TODAS en la misma fila â€”
    const resumenItems: Array<[string, string | number, boolean]> = [
      ['Subtotal',        grandSubtotal,       false],
      ['(-) Descuentos',  grandDiscount,       false],
      ['(-) Cupones',     grandCouponDiscount, false],
      ['Impuestos',       grandTax,            false],
      ['TOTAL VENTAS',    grandTotal,          true ],
      ['',                '',                  false],
      ['Total Tickets',   sales.length,        false],
      ['Ticket Promedio', sales.length > 0 ? grandTotal / sales.length : 0, false],
    ];

    const maxDataRows = Math.max(
      resumenItems.length,
      ...methodEntries.map(([m]) => paymentGroups[m].length),
    );

    for (let i = 0; i < maxDataRows; i++) {
      ws.getRow(row).height = 15;

      // Resumen izquierdo
      if (i < resumenItems.length) {
        const [concept, amount, isTotals] = resumenItems[i];
        const bg = isTotals ? C.green : (i % 2 === 0 ? C.white : 'FFEEF4FF');
        styleCell(ws.getCell(row, 1), { value: concept, bg, bold: isTotals, border: isTotals ? borders('medium') : borders('hair') });
        if (amount !== '') {
          styleCell(ws.getCell(row, 2), { value: Number(amount), bg, bold: isTotals, halign: 'right', numFmt: '#,##0.00', border: isTotals ? borders('medium') : borders('hair') });
        } else {
          ws.getCell(row, 2).fill = fill(bg); ws.getCell(row, 2).border = borders('hair');
        }
      }

      // Cada mÃ©todo en sus columnas â€” misma fila
      methodEntries.forEach(([method], idx) => {
        const mc     = mColStart(idx);
        const colors = C.methods[method] ?? C.methods.OTROS;
        const grp    = paymentGroups[method];
        const rowBg  = i % 2 === 0 ? C.white : colors.lt;

        if (i < grp.length) {
          const s = grp[i];
          styleCell(ws.getCell(row, mc),     { value: s.saleNumber ?? '',                                   bg: rowBg, border: borders('hair'), halign: 'center' });
          styleCell(ws.getCell(row, mc + 1), { value: new Date(s.createdAt).toLocaleDateString('es-PE'),    bg: rowBg, border: borders('hair'), halign: 'center' });
          styleCell(ws.getCell(row, mc + 2), { value: Number(s.total), bg: rowBg, border: borders('hair'), halign: 'right', numFmt: '#,##0.00' });
        } else {
          for (let c = mc; c <= mc + 2; c++) { ws.getCell(row, c).fill = fill(rowBg); ws.getCell(row, c).border = borders('hair'); }
        }
      });
      row++;
    }

    // â€” Fila subtotales â€”
    ws.getRow(row).height = 18;
    [1, 2].forEach(c => { ws.getCell(row, c).fill = fill(C.green); ws.getCell(row, c).border = borders('medium'); });
    methodEntries.forEach(([method, data], idx) => {
      const mc     = mColStart(idx);
      const label  = METHOD_LABEL[method] ?? method;
      const colors = C.methods[method] ?? C.methods.OTROS;
      styleCell(ws.getCell(row, mc),     { value: `SUBTOTAL ${label.toUpperCase()}`, bg: colors.bg, bold: true, color: C.white, border: borders('medium') });
      styleCell(ws.getCell(row, mc + 1), { value: `${data.count} tickets`,           bg: colors.bg, bold: true, color: C.white, border: borders('medium'), halign: 'center' });
      styleCell(ws.getCell(row, mc + 2), { value: data.total,                        bg: colors.bg, bold: true, color: C.white, border: borders('medium'), halign: 'right', numFmt: '#,##0.00' });
    });
    row++;

    // â€” Gran total â€”
    ws.getRow(row).height = 22;
    ws.mergeCells(row, 1, row, 2);
    styleCell(ws.getCell(row, 1), {
      value: `GRAN TOTAL: S/ ${grandTotal.toFixed(2)}   (${sales.length} tickets)`,
      bg: C.navy, bold: true, color: C.white, size: 12, halign: 'center', border: borders('medium'),
    });
    methodEntries.forEach(([method, data], idx) => {
      const mc     = mColStart(idx);
      const label  = METHOD_LABEL[method] ?? method;
      const colors = C.methods[method] ?? C.methods.OTROS;
      ws.mergeCells(row, mc, row, mc + 2);
      styleCell(ws.getCell(row, mc), {
        value: `${label}: S/ ${data.total.toFixed(2)}  (${data.count})`,
        bg: colors.bg, bold: true, color: C.white, size: 11, halign: 'center', border: borders('medium'),
      });
    });

    // â”€â”€ buffer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const buffer  = await wb.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ventas_${dateStr}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error exporting sales XLSX:', error);
    return NextResponse.json({ code: 'SERVER_ERROR', message: 'Error al exportar' }, { status: 500 });
  }
}
