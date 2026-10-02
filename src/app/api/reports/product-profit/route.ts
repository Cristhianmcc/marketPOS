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
    const product = searchParams.get('product');
    const groupBy = searchParams.get('groupBy') || 'day'; // day, week, month
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!product) {
      return NextResponse.json(
        { code: 'BAD_REQUEST', message: 'Producto requerido' },
        { status: 400 }
      );
    }

    // Default: last 30 days for day, 3 months for week, 12 months for month
    const defaultDays = groupBy === 'month' ? 365 : groupBy === 'week' ? 90 : 30;
    const fromDate = from ? new Date(from + 'T00:00:00.000-05:00') : new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to + 'T23:59:59.999-05:00') : new Date();

    const userFilter = session.role === 'CASHIER'
      ? Prisma.sql`AND s.user_id = ${session.userId}`
      : Prisma.empty;

    // Date truncation based on groupBy
    let dateTrunc: Prisma.Sql;
    if (groupBy === 'month') {
      dateTrunc = Prisma.sql`DATE_TRUNC('month', s.created_at)`;
    } else if (groupBy === 'week') {
      dateTrunc = Prisma.sql`DATE_TRUNC('week', s.created_at)`;
    } else {
      dateTrunc = Prisma.sql`DATE_TRUNC('day', s.created_at)`;
    }

    // Time series data
    const timeSeries = await prisma.$queryRaw<Array<{
      period: Date;
      qty: any;
      unit_cost: any;
      unit_price: any;
      total_cost: any;
      total_revenue: any;
      ticket_count: any;
    }>>(
      Prisma.sql`
        SELECT 
          ${dateTrunc} as period,
          SUM(si.quantity) as qty,
          ROUND(COALESCE(AVG(si.cost_price), 0), 2) as unit_cost,
          ROUND(AVG(si.unit_price), 2) as unit_price,
          COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
          COALESCE(SUM(si.total_line), 0) as total_revenue,
          COUNT(DISTINCT s.id) as ticket_count
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = ${session.storeId}
          AND s.created_at >= ${fromDate}
          AND s.created_at <= ${toDate}
          AND s.total > 0
          AND si.product_name = ${product}
          ${userFilter}
        GROUP BY ${dateTrunc}
        ORDER BY period ASC
      `
    );

    // Totals for the period
    const totals = await prisma.$queryRaw<Array<{
      qty: any;
      total_cost: any;
      total_revenue: any;
      ticket_count: any;
      unit_cost: any;
      unit_price: any;
    }>>(
      Prisma.sql`
        SELECT 
          SUM(si.quantity) as qty,
          COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
          COALESCE(SUM(si.total_line), 0) as total_revenue,
          COUNT(DISTINCT s.id) as ticket_count,
          ROUND(COALESCE(AVG(si.cost_price), 0), 2) as unit_cost,
          ROUND(AVG(si.unit_price), 2) as unit_price
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = ${session.storeId}
          AND s.created_at >= ${fromDate}
          AND s.created_at <= ${toDate}
          AND s.total > 0
          AND si.product_name = ${product}
          ${userFilter}
      `
    );

    const t = totals[0];
    const totalRevenue = Number(t?.total_revenue || 0);
    const totalCost = Number(t?.total_cost || 0);
    const profit = totalRevenue - totalCost;

    return NextResponse.json({
      product,
      groupBy,
      dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totals: {
        quantity: Number(t?.qty || 0),
        totalCost,
        totalRevenue,
        profit,
        margin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0,
        ticketCount: Number(t?.ticket_count || 0),
        avgUnitCost: Number(t?.unit_cost || 0),
        avgUnitPrice: Number(t?.unit_price || 0),
      },
      series: timeSeries.map(r => {
        const rev = Number(r.total_revenue);
        const cost = Number(r.total_cost);
        const p = rev - cost;
        return {
          period: r.period,
          quantity: Number(r.qty),
          totalCost: cost,
          totalRevenue: rev,
          profit: p,
          margin: rev > 0 ? (p / rev) * 100 : 0,
          ticketCount: Number(r.ticket_count),
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching product profit:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener análisis de producto' },
      { status: 500 }
    );
  }
}
