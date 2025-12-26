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
        where.createdAt.gte = new Date(from);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
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

    // Calculate promotionsTotal for each sale
    const salesWithPromotions = sales.map(sale => {
      const promotionsTotal = sale.items.reduce((sum, item) => {
        return sum + (item.promotionDiscount ? Number(item.promotionDiscount) : 0);
      }, 0);

      return {
        ...sale,
        promotionsTotal,
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
