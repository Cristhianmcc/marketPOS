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

    // Build where clause
    const where: any = {
      storeId: session.storeId,
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
    };

    // CASHIER sees only their sales
    if (session.role === 'CASHIER') {
      where.userId = session.userId;
    }

    // Get sales data
    const [sales, topProducts] = await Promise.all([
      // Sales summary
      prisma.sale.findMany({
        where,
        select: {
          id: true,
          total: true,
          paymentMethod: true,
          items: {
            select: {
              productName: true,
              productContent: true,
              quantity: true,
              subtotal: true,
            },
          },
        },
      }),
      // Top 5 products
      (() => {
        const userFilter = session.role === 'CASHIER' 
          ? Prisma.sql`AND s.user_id = ${session.userId}`
          : Prisma.empty;
        
        return prisma.$queryRaw<Array<{
          product_name: string;
          product_content: string | null;
          total_quantity: any;
          total_amount: any;
        }>>(
          Prisma.sql`
            SELECT 
              si.product_name,
              si.product_content,
              SUM(si.quantity) as total_quantity,
              SUM(si.subtotal) as total_amount
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE s.store_id = ${session.storeId}
              AND s.created_at >= ${fromDate}
              AND s.created_at <= ${toDate}
              ${userFilter}
            GROUP BY si.product_name, si.product_content
            ORDER BY total_amount DESC
            LIMIT 5
          `
        );
      })(),
    ]);

    // Calculate summary
    const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const ticketCount = sales.length;
    const averageTicket = ticketCount > 0 ? totalSales / ticketCount : 0;

    // Sales by payment method
    const paymentMethodSummary = sales.reduce((acc: any, sale) => {
      const method = sale.paymentMethod;
      if (!acc[method]) {
        acc[method] = { count: 0, total: 0 };
      }
      acc[method].count++;
      acc[method].total += Number(sale.total);
      return acc;
    }, {});

    return NextResponse.json({
      summary: {
        totalSales,
        ticketCount,
        averageTicket,
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      },
      paymentMethods: paymentMethodSummary,
      topProducts: topProducts.map(p => ({
        name: p.product_name,
        content: p.product_content,
        totalQuantity: Number(p.total_quantity),
        totalAmount: Number(p.total_amount),
      })),
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener resumen' },
      { status: 500 }
    );
  }
}
