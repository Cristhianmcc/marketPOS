import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { StockMovementSchema } from '@/domain/schemas/inventory';
import { prisma } from '@/lib/prisma';
import { adjustStockAtomically, InventoryMutationError } from '@/lib/inventory/stockMutations';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede modificar stock' },
        { status: 403 }
      );
    }

    if (!user.storeId) {
      return NextResponse.json(
        { error: 'El usuario no tiene una tienda asignada' },
        { status: 403 }
      );
    }

    const storeId = user.storeId;

    const { id } = await context.params;

    const body = await req.json();
    const validation = StockMovementSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verify belongs to user's store
    const storeProduct = await prisma.storeProduct.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!storeProduct) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    if (storeProduct.storeId !== storeId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    // Validate UNIT products require integer quantities
    if (storeProduct.product?.unitType === 'UNIT') {
      if (!Number.isInteger(data.quantity)) {
        return NextResponse.json(
          { error: 'Productos por unidad requieren cantidades enteras' },
          { status: 400 }
        );
      }
    }

    // Calculate new stock
    let newStock = Number(storeProduct.stock ?? 0);
    newStock += data.quantity;

    if (newStock < 0) {
      return NextResponse.json(
        { error: `Stock insuficiente. Stock actual: ${storeProduct.stock ?? 0}. El ajuste máximo negativo es -${storeProduct.stock ?? 0}.` },
        { status: 400 }
      );
    }

    // Aplicar el ajuste y registrar el movimiento dentro de una sola transacción.
    // El helper vuelve a validar el stock con un UPDATE condicional para evitar
    // que dos ajustes o una venta concurrente sobrescriban cantidades.
    const updated = await prisma.$transaction(async (tx) => {
      await adjustStockAtomically(tx, {
        storeId,
        storeProductId: id,
        quantity: data.quantity,
      });

      await tx.movement.create({
        data: {
          storeId,
          storeProductId: id,
          type: data.type,
          quantity: data.quantity,
          unitPrice: data.unitPrice ?? null,
          total: data.total ?? null,
          notes: data.notes ?? null,
          createdById: user.userId,
        },
      });

      return tx.storeProduct.findUnique({
        where: { id },
        include: { product: true },
      });
    });

    return NextResponse.json({ storeProduct: updated });
  } catch (error) {
    if (error instanceof InventoryMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 }
      );
    }

    console.error('Error updating stock:', error);
    return NextResponse.json(
      { error: 'Error al actualizar stock' },
      { status: 500 }
    );
  }
}
