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
    const status = searchParams.get('status'); // OPEN, PAID, CANCELLED

    // Build where clause
    const where: any = {
      storeId: session.storeId,
    };

    if (status) {
      where.status = status;
    }

    // Fetch receivables with relations
    const receivables = await prisma.receivable.findMany({
      where,
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            dni: true,
          },
        },
        sale: {
          select: {
            saleNumber: true,
            total: true,
            createdAt: true,
          },
        },
        payments: {
          select: {
            amount: true,
            method: true,
            notes: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Generate CSV
    const headers = [
      'Cliente',
      'Telefono',
      'DNI',
      'Ticket',
      'Fecha Venta',
      'Monto Original',
      'Saldo Actual',
      'Estado',
      'Pagos Realizados',
      'Ultimo Pago',
      'Creado Por',
      'Fecha Creacion',
    ];

    const rows = receivables.map(r => {
      const totalPagado = r.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const lastPayment = r.payments.length > 0 
        ? new Date(r.payments[r.payments.length - 1].createdAt).toLocaleString('es-PE')
        : 'Sin pagos';

      return [
        escapeCSV(r.customer.name),
        escapeCSV(r.customer.phone || ''),
        escapeCSV(r.customer.dni || ''),
        escapeCSV(r.sale.saleNumber),
        escapeCSV(new Date(r.sale.createdAt).toLocaleDateString('es-PE')),
        escapeCSV(Number(r.originalAmount).toFixed(2)),
        escapeCSV(Number(r.balance).toFixed(2)),
        escapeCSV(r.status === 'OPEN' ? 'Abierta' : r.status === 'PAID' ? 'Pagada' : 'Cancelada'),
        escapeCSV(totalPagado.toFixed(2)),
        escapeCSV(lastPayment),
        escapeCSV(r.createdBy.name),
        escapeCSV(new Date(r.createdAt).toLocaleString('es-PE')),
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const statusLabel = status === 'OPEN' ? 'Abiertas' : status === 'PAID' ? 'Pagadas' : status === 'CANCELLED' ? 'Canceladas' : 'Todas';
    const filename = `cuentas-por-cobrar-${statusLabel}-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting receivables:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al exportar cuentas por cobrar' },
      { status: 500 }
    );
  }
}
