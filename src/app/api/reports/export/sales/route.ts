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

    const sales = await prisma.sale.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
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
    const headers = [
      'Ticket',
      'Fecha',
      'Hora',
      'Subtotal',
      'Impuesto',
      'Total',
      'Metodo Pago',
      'Monto Pagado',
      'Vuelto',
      'Cajero',
      'Turno',
      'Impreso',
    ];

    const rows = sales.map(s => [
      escapeCSV(s.saleNumber),
      escapeCSV(new Date(s.createdAt).toLocaleDateString('es-PE')),
      escapeCSV(new Date(s.createdAt).toLocaleTimeString('es-PE')),
      escapeCSV(Number(s.subtotal).toFixed(2)),
      escapeCSV(Number(s.tax).toFixed(2)),
      escapeCSV(Number(s.total).toFixed(2)),
      escapeCSV(s.paymentMethod),
      escapeCSV(Number(s.amountPaid).toFixed(2)),
      escapeCSV(Number(s.changeAmount).toFixed(2)),
      escapeCSV(s.user.name),
      escapeCSV(s.shift ? new Date(s.shift.openedAt).toLocaleString('es-PE') : ''),
      escapeCSV(s.printedAt ? 'Si' : 'No'),
    ]);

    const csv = [
      headers.join(';'),
      ...rows.map(row => row.join(';')),
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
