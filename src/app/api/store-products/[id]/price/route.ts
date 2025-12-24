import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { UpdatePriceSchema } from '@/domain/schemas/inventory';
import { PrismaStoreProductRepository } from '@/infra/db/repositories/PrismaStoreProductRepository';

const storeProductRepo = new PrismaStoreProductRepository();

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
        { error: 'Solo el propietario puede editar precios' },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const body = await req.json();
    const validation = UpdatePriceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    // Verify belongs to user's store
    const storeProduct = await storeProductRepo.findById(id);
    if (!storeProduct) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    if (storeProduct.storeId !== user.storeId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const updated = await storeProductRepo.updatePrice(id, validation.data.price);

    return NextResponse.json({ storeProduct: updated });
  } catch (error) {
    console.error('Error updating price:', error);
    return NextResponse.json(
      { error: 'Error al actualizar precio' },
      { status: 500 }
    );
  }
}
