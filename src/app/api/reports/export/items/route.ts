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

    // Build where clause for sales
    const salesWhere: any = {
      storeId: session.storeId,
    };

    if (from) {
      salesWhere.createdAt = { ...salesWhere.createdAt, gte: new Date(from + 'T00:00:00.000-05:00') };
    }
    if (to) {
      salesWhere.createdAt = { ...salesWhere.createdAt, lte: new Date(to + 'T23:59:59.999-05:00') };
    }

    // CASHIER sees only their sales
    if (session.role === 'CASHIER') {
      salesWhere.userId = session.userId;
    }

    const items = await prisma.saleItem.findMany({
      where: {
        sale: salesWhere,
      },
      include: {
        sale: {
          select: {
            saleNumber: true,
            createdAt: true,
            paymentMethod: true,
          },
        },
      },
      orderBy: {
        sale: {
          createdAt: 'desc',
        },
      },
    });

    // Generate CSV
    const headers = [
      'Ticket',
      'Fecha',
      'Producto',
      'Contenido',
      'Tipo',
      'Cantidad',
      'Precio Unit',
      'Subtotal',
      'Desc. Tipo',
      'Desc. Valor',
      'Desc. Monto',
      'Total Linea',
      'Metodo Pago',
    ];

    const rows = items.map(item => {
      const discountTypeLabel = item.discountType === 'PERCENT' ? 'Porcentaje' : 
                                item.discountType === 'AMOUNT' ? 'Monto' : '-';
      const discountValueLabel = item.discountValue 
        ? (item.discountType === 'PERCENT' 
            ? `${Number(item.discountValue).toFixed(0)}%` 
            : Number(item.discountValue).toFixed(2))
        : '-';
      
      return [
        escapeCSV(item.sale.saleNumber),
        escapeCSV(new Date(item.sale.createdAt).toLocaleString('es-PE')),
        escapeCSV(item.productName),
        escapeCSV(item.productContent || ''),
        escapeCSV(item.unitType),
        escapeCSV(Number(item.quantity).toFixed(3)),
        escapeCSV(Number(item.unitPrice).toFixed(2)),
        escapeCSV(Number(item.subtotal).toFixed(2)),
        escapeCSV(discountTypeLabel),
        escapeCSV(discountValueLabel),
        escapeCSV(Number(item.discountAmount).toFixed(2)),
        escapeCSV(Number(item.totalLine).toFixed(2)),
        escapeCSV(item.sale.paymentMethod),
      ];
    });

    const csv = [
      headers.join(';'),
      ...rows.map(row => row.join(';')),
    ].join('\n');

    // Add BOM for UTF-8 recognition in Excel
    const csvWithBOM = '\uFEFF' + csv;

    return new NextResponse(csvWithBOM, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="items_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting items:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al exportar items' },
      { status: 500 }
    );
  }
}
