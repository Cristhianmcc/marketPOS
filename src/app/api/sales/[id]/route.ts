import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const sale = await prisma.sale.findUnique({
      where: {
        id,
        storeId: session.storeId,
      },
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
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        shift: {
          include: {
            openedBy: {
              select: {
                name: true,
              },
            },
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            ruc: true,
            address: true,
            phone: true,
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { code: 'SALE_NOT_FOUND', message: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    // Check permissions: OWNER sees all, CASHIER sees only their sales
    if (session.role === 'CASHIER' && sale.userId !== session.userId) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permiso para ver esta venta' },
        { status: 403 }
      );
    }

    return NextResponse.json({ sale });
  } catch (error) {
    console.error('Error fetching sale:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener venta' },
      { status: 500 }
    );
  }
}
