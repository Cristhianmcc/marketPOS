// app/api/sales/[id]/cancel/route.ts
// Anular ventas con reversión de stock ACID

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: saleId } = await params;
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Buscar venta con items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
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
        user: true,
      },
    });

    if (!sale) {
      return NextResponse.json(
        { code: 'SALE_NOT_FOUND', message: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    // Validar storeId
    if (sale.storeId !== session.storeId) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes acceso a esta venta' },
        { status: 403 }
      );
    }

    // Verificar si ya está anulada
    if (sale.total === 0 && sale.subtotal === 0 && sale.tax === 0) {
      return NextResponse.json(
        { code: 'SALE_ALREADY_CANCELLED', message: 'Esta venta ya está anulada' },
        { status: 409 }
      );
    }

    // VALIDACIÓN DE PERMISOS
    if (session.role === 'CASHIER') {
      // CASHIER solo puede anular su último ticket
      if (sale.userId !== session.userId) {
        return NextResponse.json(
          { code: 'SALE_NOT_ALLOWED', message: 'Solo puedes anular tus propias ventas' },
          { status: 403 }
        );
      }

      // Verificar que sea el último ticket creado por este cajero
      const lastSale = await prisma.sale.findFirst({
        where: {
          storeId: session.storeId,
          userId: session.userId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!lastSale || lastSale.id !== saleId) {
        return NextResponse.json(
          { code: 'SALE_NOT_ALLOWED', message: 'Solo puedes anular tu último ticket' },
          { status: 403 }
        );
      }
    } else if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos para anular ventas' },
        { status: 403 }
      );
    }

    // TRANSACCIÓN ACID: Anular venta + Revertir stock
    const result = await prisma.$transaction(async (tx) => {
      // 1. Marcar venta como anulada
      const cancelledSale = await tx.sale.update({
        where: { id: saleId },
        data: {
          total: 0,
          subtotal: 0,
          tax: 0,
        },
      });

      // 2. Por cada item: revertir stock + crear movement inverso
      for (const item of sale.items) {
        const storeProduct = item.storeProduct;

        // Actualizar stock (sumar lo que se vendió)
        await tx.storeProduct.update({
          where: { id: storeProduct.id },
          data: {
            stock: {
              increment: item.quantity,
            },
          },
        });

        // Crear movement inverso (ADJUSTMENT)
        await tx.movement.create({
          data: {
            storeId: session.storeId,
            storeProductId: storeProduct.id,
            type: 'ADJUSTMENT',
            quantity: item.quantity, // positivo = suma
            notes: `Anulación ticket #${sale.saleNumber}`,
            createdById: session.userId,
            createdAt: new Date(),
          },
        });
      }

      return cancelledSale;
    });

    return NextResponse.json({
      success: true,
      saleId: result.id,
      cancelledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error cancelling sale:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al anular venta' },
      { status: 500 }
    );
  }
}
