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
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);

    // Build where clause
    const where: any = {
      storeId: session.storeId,
      closedAt: { not: null }, // Only closed shifts
    };

    // Date range
    if (from) {
      where.openedAt = { ...where.openedAt, gte: new Date(from + 'T00:00:00.000-05:00') };
    }
    if (to) {
      where.closedAt = { ...where.closedAt, lte: new Date(to + 'T23:59:59.999-05:00') };
    }

    // Filter by user (OWNER can filter, CASHIER sees only own)
    if (session.role === 'CASHIER') {
      where.openedById = session.userId;
    } else if (userId) {
      where.openedById = userId;
    }

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        include: {
          openedBy: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          openedAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shift.count({ where }),
    ]);

    // Get sales for each shift
    const shiftsWithSales = await Promise.all(
      shifts.map(async (shift) => {
        const salesSummary = await prisma.sale.aggregate({
          where: {
            shiftId: shift.id,
            storeId: session.storeId,
            total: { gt: 0 },
          },
          _sum: {
            total: true,
          },
          _count: {
            id: true,
          },
        });

        return {
          id: shift.id,
          openedAt: shift.openedAt,
          closedAt: shift.closedAt,
          openingCash: Number(shift.openingCash),
          closingCash: shift.closingCash ? Number(shift.closingCash) : null,
          expectedCash: shift.expectedCash ? Number(shift.expectedCash) : null,
          difference: shift.difference ? Number(shift.difference) : null,
          notes: shift.notes,
          openedBy: shift.openedBy.name,
          totalSales: salesSummary._sum.total ? Number(salesSummary._sum.total) : 0,
          ticketCount: salesSummary._count.id,
        };
      })
    );

    return NextResponse.json({
      shifts: shiftsWithSales,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching shifts report:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener reporte de turnos' },
      { status: 500 }
    );
  }
}
