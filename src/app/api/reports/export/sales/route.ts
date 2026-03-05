import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Build where clause
    const where: any = {
      storeId: session.storeId,
      total: { gt: 0 }, // Exclude cancelled sales
    };

    if (from) {
      where.createdAt = { ...where.createdAt, gte: new Date(from + 'T00:00:00.000-05:00') };
    }
    if (to) {
      where.createdAt = { ...where.createdAt, lte: new Date(to + 'T23:59:59.999-05:00') };
    }

    // CASHIER sees only their sales
    if (session.role === 'CASHIER') {
      where.userId = session.userId;
    }

    // Obtener info de tienda y usuario actual para el encabezado
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
        user: {
          select: {
            name: true,
          },
        },
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        shift: {
          select: {
            openedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Generate CSV
    // Columna de cupón solo aparece si alguna venta usó cupón
    const hasCoupons = sales.some(s => s.couponCode && Number(s.couponDiscount) > 0);

    const headers = [
      'Ticket',
      'Fecha',
      'Hora',
      'Subtotal',
      'Descuentos',
      ...(hasCoupons ? ['Cupón'] : []),
      'Impuesto',
      'Total',
      'Método Pago',
      'Pagado',
      'Vuelto',
      'Cliente',
      'Cajero',
      'Impreso',
    ];

    const rows = sales.map(s => [
      escapeCSV(s.saleNumber),
      escapeCSV(new Date(s.createdAt).toLocaleDateString('es-PE')),
      escapeCSV(new Date(s.createdAt).toLocaleTimeString('es-PE')),
      escapeCSV(Number(s.subtotal).toFixed(2)),
      escapeCSV(Number(s.discountTotal).toFixed(2)),
      ...(hasCoupons
        ? [escapeCSV(
            s.couponCode
              ? `${s.couponCode} (-S/${Number(s.couponDiscount).toFixed(2)})`
              : ''
          )]
        : []),
      escapeCSV(Number(s.tax).toFixed(2)),
      escapeCSV(Number(s.total).toFixed(2)),
      escapeCSV(s.paymentMethod),
      escapeCSV(s.amountPaid !== null ? Number(s.amountPaid).toFixed(2) : ''),
      escapeCSV(s.changeAmount !== null ? Number(s.changeAmount).toFixed(2) : ''),
      escapeCSV(s.customer?.name || ''),
      escapeCSV(s.user.name),
      escapeCSV(s.printedAt ? 'Si' : 'No'),
    ]);

    // --- Resumen por método de pago ---
    const paymentGroups: Record<string, typeof sales> = {};
    const paymentSummary: Record<string, { count: number; total: number }> = {};
    let grandTotal = 0;
    let grandSubtotal = 0;
    let grandDiscount = 0;
    let grandCouponDiscount = 0;
    let grandTax = 0;

    for (const s of sales) {
      const method = s.paymentMethod || 'OTROS';
      const total = Number(s.total);
      if (!paymentSummary[method]) {
        paymentSummary[method] = { count: 0, total: 0 };
        paymentGroups[method] = [];
      }
      paymentSummary[method].count += 1;
      paymentSummary[method].total += total;
      paymentGroups[method].push(s);
      grandTotal += total;
      grandSubtotal += Number(s.subtotal);
      grandDiscount += Number(s.discountTotal);
      grandCouponDiscount += Number(s.couponDiscount);
      grandTax += Number(s.tax);
    }

    const methodLabels: Record<string, string> = {
      CASH: 'Efectivo',
      YAPE: 'Yape',
      PLIN: 'Plin',
      CARD: 'Tarjeta',
      CREDIT: 'Fiado',
    };

    const ec = (v: any) => escapeCSV(String(v ?? ''));
    const roleLabel: Record<string, string> = { OWNER: 'Propietario', ADMIN: 'Administrador', CASHIER: 'Cajero' };
    const exportDate = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const periodLabel = from && to ? `${from} al ${to}` : from ? `desde ${from}` : to ? `hasta ${to}` : 'Todos los registros';

    // ══════════════════════════════════════════════════════════════════════
    // ENCABEZADO FORMAL — 2 bloques lado a lado
    // Cols A-B: Datos de empresa | Col C: vacío | Cols D-F: Datos exportación
    // ══════════════════════════════════════════════════════════════════════
    const leftBlock: [string, string][] = [
      ['══════════════════════════════', ''],
      ['DATOS DE LA EMPRESA',           ''],
      ['══════════════════════════════', ''],
      ['',                              ''],
      ['Tienda',                        store?.name     || ''],
      ['RUC',                           store?.ruc      || ''],
      ['Direccion',                     store?.address  || ''],
    ];
    const rightBlock: [string, string][] = [
      ['══════════════════════════════', ''],
      ['AUDITORIA DE EXPORTACION',      ''],
      ['══════════════════════════════', ''],
      ['',                              ''],
      ['Exportado por',  currentUser?.name || ''],
      ['Cargo',          roleLabel[currentUser?.role || ''] || ''],
      ['Fecha exportacion', exportDate],
      ['Periodo',        periodLabel],
      ['Total registros', String(sales.length)],
    ];

    const hMax = Math.max(leftBlock.length, rightBlock.length);
    const WIDE = '══════════════════════════════════════════════════════════════════════════════';

    const headerRows: string[] = [
      ec(WIDE),
      ec('REPORTE AUDITORIA DE VENTAS'),
      ec(WIDE),
      '',
    ];
    for (let i = 0; i < hMax; i++) {
      const l  = leftBlock[i]  || ['', ''];
      const ri = rightBlock[i] || ['', ''];
      headerRows.push([ec(l[0]), ec(l[1]), '', '', ec(ri[0]), ec(ri[1])].join(';'));
    }
    headerRows.push('');
    headerRows.push(ec(WIDE));
    headerRows.push('');

    // ══════════════════════════════════════════════════════════════════════
    // RESUMEN + MÉTODOS DE PAGO HORIZONTALES
    // Col A-B: RESUMEN GENERAL | Col D-F: EFECTIVO | Col H-J: YAPE | ...
    // ══════════════════════════════════════════════════════════════════════

    // Columna RESUMEN (2 cols)
    const THIN = '──────────────────────';
    const resumenBlock: [string, string][] = [
      ['══════════════════════════', ''],
      ['RESUMEN GENERAL',           ''],
      ['══════════════════════════', ''],
      ['',                          ''],
      ['Concepto',     'Monto (S/)'],
      [THIN,           THIN],
      ['Subtotal',                  grandSubtotal.toFixed(2)],
      ['(-) Descuentos',            grandDiscount.toFixed(2)],
      ['(-) Cupones',               grandCouponDiscount.toFixed(2)],
      ['Impuestos',                 grandTax.toFixed(2)],
      [THIN,           THIN],
      ['TOTAL VENTAS',              grandTotal.toFixed(2)],
      ['',                          ''],
      ['Total Tickets',             String(sales.length)],
      ['Ticket Promedio',           sales.length > 0 ? (grandTotal / sales.length).toFixed(2) : '0.00'],
    ];

    // Columnas por método de pago (3 cols cada una: N°Ticket, Fecha, Total)
    type G3 = [string, string, string];
    const methodEntries = Object.entries(paymentSummary).sort((a, b) => b[1].total - a[1].total);

    const paymentCols: G3[][] = methodEntries.map(([method, data]) => {
      const label = methodLabels[method] || method;
      const grp = paymentGroups[method];
      const g: G3[] = [];
      g.push(['══════════════════════════', '', '']);
      g.push([`VENTAS - ${label.toUpperCase()}`, '', '']);
      g.push(['══════════════════════════', '', '']);
      g.push(['', '', '']);
      g.push(['N° Ticket', 'Fecha', 'Total (S/)']);
      g.push(['─────────', '──────────', '──────────']);
      for (const s of grp) {
        g.push([
          String(s.saleNumber),
          new Date(s.createdAt).toLocaleDateString('es-PE'),
          Number(s.total).toFixed(2),
        ]);
      }
      g.push(['─────────', '──────────', '──────────']);
      g.push([`SUBTOTAL ${label.toUpperCase()}`, '', data.total.toFixed(2)]);
      g.push(['Cantidad tickets', '', String(data.count)]);
      return g;
    });

    // Nivelar filas: calcular el máximo entre todos los bloques
    const sMax = Math.max(resumenBlock.length, ...paymentCols.map(g => g.length));

    const summaryRows: string[] = ['', ''];

    for (let i = 0; i < sMax; i++) {
      const cells: string[] = [];
      const res = resumenBlock[i] || ['', ''];
      cells.push(ec(res[0]), ec(res[1]), ''); // A, B, C(sep)
      for (const group of paymentCols) {
        const g = group[i] || ['', '', ''];
        cells.push(ec(g[0]), ec(g[1]), ec(g[2]), ''); // col1, col2, col3, sep
      }
      summaryRows.push(cells.join(';'));
    }

    // Fila de gran total
    summaryRows.push('');
    const totCells: string[] = [ec('GRAN TOTAL'), ec(`S/ ${grandTotal.toFixed(2)}`), ''];
    for (const [method, data] of methodEntries) {
      const label = methodLabels[method] || method;
      totCells.push(ec(`${label}: S/ ${data.total.toFixed(2)}`), ec(`(${data.count} tickets)`), '', '');
    }
    summaryRows.push(totCells.join(';'));

    const csv = [
      ...headerRows,
      headers.join(';'),
      ...rows.map(row => row.join(';')),
      ...summaryRows,
    ].join('\n');

    // Add BOM for UTF-8 recognition in Excel
    const csvWithBOM = '\uFEFF' + csv;

    return new NextResponse(csvWithBOM, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ventas_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting sales:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al exportar ventas' },
      { status: 500 }
    );
  }
}
