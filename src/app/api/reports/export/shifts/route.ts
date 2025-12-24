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
      closedAt: { not: null },
    };

    if (from) {
      where.openedAt = { ...where.openedAt, gte: new Date(from + 'T00:00:00.000-05:00') };
    }
    if (to) {
      where.closedAt = { ...where.closedAt, lte: new Date(to + 'T23:59:59.999-05:00') };
    }

    // CASHIER sees only their shifts
    if (session.role === 'CASHIER') {
      where.openedById = session.userId;
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        openedBy: {
          select: {
            name: true,
          },
        },
        closedBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        openedAt: 'desc',
      },
    });

    // Generate CSV
    const headers = [
      'Fecha Apertura',
      'Fecha Cierre',
      'Abierto Por',
      'Cerrado Por',
      'Caja Inicial',
      'Efectivo Esperado',
      'Caja Final',
      'Diferencia',
      'Notas',
    ];

    const rows = shifts.map(s => [
      escapeCSV(new Date(s.openedAt).toLocaleString('es-PE')),
      escapeCSV(s.closedAt ? new Date(s.closedAt).toLocaleString('es-PE') : ''),
      escapeCSV(s.openedBy.name),
      escapeCSV(s.closedBy?.name || ''),
      escapeCSV(Number(s.openingCash).toFixed(2)),
      escapeCSV(s.expectedCash ? Number(s.expectedCash).toFixed(2) : ''),
      escapeCSV(s.closingCash ? Number(s.closingCash).toFixed(2) : ''),
      escapeCSV(s.difference ? Number(s.difference).toFixed(2) : ''),
      escapeCSV(s.notes || ''),
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
        'Content-Disposition': `attachment; filename="turnos_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting shifts:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al exportar turnos' },
      { status: 500 }
    );
  }
}
