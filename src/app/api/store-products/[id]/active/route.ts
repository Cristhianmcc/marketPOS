import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { PrismaStoreProductRepository } from '@/infra/db/repositories/PrismaStoreProductRepository';
import { prisma } from '@/infra/db/prisma';

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
        { error: 'Solo el propietario puede cambiar estado' },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const { active } = body;

    if (typeof active !== 'boolean') {
      return NextResponse.json(
        { error: 'Campo active debe ser booleano' },
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

    // Reactivar: simple update
    if (active === true) {
      const updated = await storeProductRepo.updateActive(id, true);
      return NextResponse.json({ storeProduct: updated });
    }

    // Desactivar: intentar eliminar si no tiene ventas registradas
    const salesCount = await prisma.saleItem.count({
      where: { storeProductId: id },
    });

    if (salesCount > 0) {
      // Tiene ventas → solo desactivar (no se puede eliminar sin romper historial)
      const updated = await storeProductRepo.updateActive(id, false);
      return NextResponse.json({
        storeProduct: updated,
        softDeleted: true,
        message: 'El producto fue desactivado. No se puede eliminar porque tiene ventas registradas.',
      });
    }

    // Sin ventas → eliminar completamente para liberar el código de barras
    const productId = storeProduct.productId;
    await prisma.storeProduct.delete({ where: { id } });

    // Eliminar ProductMaster si ninguna otra tienda lo usa
    const otherStoreProducts = await prisma.storeProduct.count({
      where: { productId },
    });
    if (otherStoreProducts === 0) {
      await prisma.productMaster.delete({ where: { id: productId } });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Error updating active status:', error);
    return NextResponse.json(
      { error: 'Error al actualizar estado' },
      { status: 500 }
    );
  }
}
