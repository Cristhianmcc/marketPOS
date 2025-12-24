import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';

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

    // Default: last 7 days
    const fromDate = from ? new Date(from + 'T00:00:00.000-05:00') : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to + 'T23:59:59.999-05:00') : new Date();

    // Query daily sales
    const userFilter = session.role === 'CASHIER' 
      ? Prisma.sql`AND s.user_id = ${session.userId}`
      : Prisma.empty;
    
    const dailySales = await prisma.$queryRaw<Array<{
      sale_date: Date;
      ticket_count: bigint;
      total_sales: any;
      cash_total: any;
      other_total: any;
    }>>(
      Prisma.sql`
        SELECT 
          DATE(s.created_at) as sale_date,
          COUNT(s.id)::bigint as ticket_count,
          SUM(s.total) as total_sales,
          SUM(CASE WHEN s.payment_method = 'CASH' THEN s.total ELSE 0 END) as cash_total,
          SUM(CASE WHEN s.payment_method != 'CASH' THEN s.total ELSE 0 END) as other_total
        FROM sales s
        WHERE s.store_id = ${session.storeId}
          AND s.created_at >= ${fromDate}
          AND s.created_at <= ${toDate}
          AND s.total > 0
          ${userFilter}
        GROUP BY DATE(s.created_at)
        ORDER BY sale_date DESC
      `
    );

    return NextResponse.json({
      sales: dailySales.map(d => ({
        date: d.sale_date,
        ticketCount: Number(d.ticket_count),
        totalSales: Number(d.total_sales),
        cashTotal: Number(d.cash_total),
        otherTotal: Number(d.other_total),
      })),
    });
  } catch (error) {
    console.error('Error fetching daily sales:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener ventas diarias' },
      { status: 500 }
    );
  }
}
