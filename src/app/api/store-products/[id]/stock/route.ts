import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { StockMovementSchema } from '@/domain/schemas/inventory';
import { PrismaStoreProductRepository } from '@/infra/db/repositories/PrismaStoreProductRepository';
import { PrismaMovementRepository } from '@/infra/db/repositories/PrismaMovementRepository';

const storeProductRepo = new PrismaStoreProductRepository();
const movementRepo = new PrismaMovementRepository();

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
    const storeProduct = await storeProductRepo.findById(id);
    if (!storeProduct) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    if (storeProduct.storeId !== user.storeId) {
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
    let newStock = storeProduct.stock ?? 0;
    newStock += data.quantity;

    if (newStock < 0) {
      return NextResponse.json(
        { error: 'Stock no puede ser negativo' },
        { status: 400 }
      );
    }

    // Update stock
    const updated = await storeProductRepo.updateStock(id, newStock);

    // Create movement record
    await movementRepo.create({
      storeId: user.storeId,
      storeProductId: id,
      type: data.type,
      quantity: data.quantity,
      unitPrice: data.unitPrice ?? null,
      total: data.total ?? null,
      notes: data.notes ?? null,
      createdById: user.userId,
    });

    return NextResponse.json({ storeProduct: updated });
  } catch (error) {
    console.error('Error updating stock:', error);
    return NextResponse.json(
      { error: 'Error al actualizar stock' },
      { status: 500 }
    );
  }
}
