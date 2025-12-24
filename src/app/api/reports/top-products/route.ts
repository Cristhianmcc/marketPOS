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
    const by = searchParams.get('by') || 'amount'; // 'amount' or 'quantity'
    const limit = parseInt(searchParams.get('limit') || '10');

    // Default: last 30 days
    const fromDate = from ? new Date(from + 'T00:00:00.000-05:00') : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to + 'T23:59:59.999-05:00') : new Date();

    const orderByClause = by === 'quantity' ? 'total_quantity' : 'total_amount';
    const userFilter = session.role === 'CASHIER' 
      ? Prisma.sql`AND s.user_id = ${session.userId}`
      : Prisma.empty;

    const topProducts = await prisma.$queryRaw<Array<{
      product_name: string;
      product_content: string | null;
      unit_type: string;
      total_quantity: any;
      total_amount: any;
    }>>(
      Prisma.sql`
        SELECT 
          si.product_name,
          si.product_content,
          si.unit_type,
          SUM(si.quantity) as total_quantity,
          SUM(si.subtotal) as total_amount
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = ${session.storeId}
          AND s.created_at >= ${fromDate}
          AND s.created_at <= ${toDate}
          ${userFilter}
        GROUP BY si.product_name, si.product_content, si.unit_type
        ORDER BY ${Prisma.raw(orderByClause)} DESC
        LIMIT ${limit}
      `
    );

    return NextResponse.json({
      products: topProducts.map(p => ({
        name: p.product_name,
        content: p.product_content,
        unitType: p.unit_type,
        totalQuantity: Number(p.total_quantity),
        totalAmount: Number(p.total_amount),
      })),
      by,
      limit,
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching top products:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener top productos' },
      { status: 500 }
    );
  }
}
