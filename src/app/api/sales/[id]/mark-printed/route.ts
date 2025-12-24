import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function POST(
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
    });

    if (!sale) {
      return NextResponse.json(
        { code: 'SALE_NOT_FOUND', message: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    // Update printedAt
    const updatedSale = await prisma.sale.update({
      where: { id },
      data: { printedAt: new Date() },
    });

    return NextResponse.json({ 
      success: true,
      printedAt: updatedSale.printedAt 
    });
  } catch (error) {
    console.error('Error marking sale as printed:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al marcar venta como impresa' },
      { status: 500 }
    );
  }
}
