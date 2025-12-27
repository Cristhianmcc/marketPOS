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
      total: {
        gt: 0, // Excluir ventas anuladas
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
          discountTotal: true,
          couponDiscount: true, // ✅ Cupones (Módulo 14.2-A)
          paymentMethod: true,
          items: {
            select: {
              productName: true,
              productContent: true,
              quantity: true,
              subtotal: true,
              promotionDiscount: true,
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
              AND s.total > 0
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
    
    // Calcular promociones totales
    const totalPromotions = sales.reduce((sum, s) => {
      const itemPromotions = s.items.reduce((itemSum, item) => {
        return itemSum + Number(item.promotionDiscount || 0);
      }, 0);
      return sum + itemPromotions;
    }, 0);
    
    // Calcular descuentos: discountTotal de la venta
    const totalDiscounts = sales.reduce((sum, s) => {
      return sum + Number(s.discountTotal || 0);
    }, 0);

    // ✅ Calcular cupones totales (Módulo 14.2-A)
    const totalCoupons = sales.reduce((sum, s) => {
      return sum + Number(s.couponDiscount || 0);
    }, 0);

    // ✅ Calcular promos categoría totales (Módulo 14.2-B)
    const totalCategoryPromotions = await prisma.saleItem.aggregate({
      where: {
        sale: {
          storeId: session.storeId,
          createdAt: {
            gte: fromDate,
            lt: toDate,
          },
        },
      },
      _sum: {
        categoryPromoDiscount: true,
      },
    }).then(result => Number(result._sum.categoryPromoDiscount || 0));

    // ✅ Calcular promos volumen totales (Módulo 14.2-C1)
    const totalVolumePromotions = await prisma.saleItem.aggregate({
      where: {
        sale: {
          storeId: session.storeId,
          createdAt: {
            gte: fromDate,
            lt: toDate,
          },
        },
      },
      _sum: {
        volumePromoDiscount: true,
      },
    }).then(result => Number(result._sum.volumePromoDiscount || 0));
    
    const ticketCount = sales.length;
    const averageTicket = ticketCount > 0 ? totalSales / ticketCount : 0;

    // FIADO metrics
    const totalFiado = sales
      .filter(s => s.paymentMethod === 'FIADO')
      .reduce((sum, s) => sum + Number(s.total), 0);

    // Get FIADO payments in date range
    const fiadoPayments = await prisma.receivablePayment.aggregate({
      where: {
        storeId: session.storeId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _sum: {
        amount: true,
      },
    });
    const fiadoCobrado = Number(fiadoPayments._sum.amount || 0);

    // Get current pending balance (all open receivables)
    const openReceivables = await prisma.receivable.aggregate({
      where: {
        storeId: session.storeId,
        status: 'OPEN',
      },
      _sum: {
        balance: true,
      },
    });
    const saldoPendiente = Number(openReceivables._sum.balance || 0);

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
        totalPromotions,
        totalDiscounts,
        totalCoupons, // ✅ Cupones (Módulo 14.2-A)
        totalCategoryPromotions, // ✅ Promos Categoría (Módulo 14.2-B)
        totalVolumePromotions, // ✅ Promos Volumen (Módulo 14.2-C1)
        ticketCount,
        averageTicket,
        totalFiado,
        fiadoCobrado,
        saldoPendiente,
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
