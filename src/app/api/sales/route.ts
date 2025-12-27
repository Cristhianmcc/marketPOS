import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

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
    const shiftId = searchParams.get('shiftId');
    const query = searchParams.get('query'); // Search by saleNumber
    const from = searchParams.get('from'); // Date from
    const to = searchParams.get('to'); // Date to

    // Build where clause
    const where: any = {
      storeId: session.storeId,
    };

    // Filter by shift
    if (shiftId) {
      where.shiftId = shiftId;
    }

    // Filter by cashier for CASHIER role
    if (session.role === 'CASHIER' && !shiftId) {
      where.userId = session.userId;
    }

    // Search by sale number
    if (query) {
      where.saleNumber = {
        contains: query,
        mode: 'insensitive',
      };
    }

    // Date range filter
    if (from || to) {
      where.createdAt = {};
      if (from) {
        // Parse date in Peru timezone (UTC-5)
        where.createdAt.gte = new Date(from + 'T00:00:00.000-05:00');
      }
      if (to) {
        // Parse date in Peru timezone (UTC-5)
        where.createdAt.lte = new Date(to + 'T23:59:59.999-05:00');
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            storeProduct: {
              include: {
                product: true,
              },
            },
          },
        },
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100, // Limit to last 100 sales
    });

    // Calculate promotionsTotal and categoryPromotionsTotal for each sale
    const salesWithPromotions = sales.map(sale => {
      const promotionsTotal = sale.items.reduce((sum, item) => {
        return sum + (item.promotionDiscount ? Number(item.promotionDiscount) : 0);
      }, 0);

      const categoryPromotionsTotal = sale.items.reduce((sum, item) => {
        return sum + (item.categoryPromoDiscount ? Number(item.categoryPromoDiscount) : 0);
      }, 0);

      return {
        ...sale,
        promotionsTotal,
        categoryPromotionsTotal,
      };
    });

    return NextResponse.json({ sales: salesWithPromotions });
  } catch (error) {
    console.error('Error fetching sales:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener ventas' },
      { status: 500 }
    );
  }
}
