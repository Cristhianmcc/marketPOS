import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { syncProductToCatalog } from '@/lib/catalogSync';

export async function PUT(
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
        { error: 'Solo el propietario puede editar productos' },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const body = await req.json();
    const { name, brand, content, barcode, category, price, minStock, imageUrl, baseUnitId } = body;

    // Verificar que el storeProduct pertenece a esta tienda
    const storeProduct = await prisma.storeProduct.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!storeProduct) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    if (storeProduct.storeId !== user.storeId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    // Validaciones básicas
    if (price !== undefined && (isNaN(Number(price)) || Number(price) <= 0)) {
      return NextResponse.json({ error: 'El precio debe ser mayor a 0' }, { status: 400 });
    }

    // Actualizar campos del producto maestro (solo si no es global)
    if (!storeProduct.product.isGlobal) {
      const productUpdates: Record<string, string | null> = {};
      if (name !== undefined)       productUpdates.name       = String(name).trim();
      if (brand !== undefined)      productUpdates.brand      = brand ? String(brand).trim() : null;
      if (content !== undefined)    productUpdates.content    = content ? String(content).trim() : null;
      if (barcode !== undefined)    productUpdates.barcode    = barcode ? String(barcode).trim() : null;
      if (category !== undefined)   productUpdates.category   = String(category).trim();
      if (imageUrl !== undefined)   productUpdates.imageUrl   = imageUrl || null;
      if (baseUnitId !== undefined) productUpdates.baseUnitId = baseUnitId || null;

      if (Object.keys(productUpdates).length > 0) {
        await prisma.productMaster.update({
          where: { id: storeProduct.productId },
          data: productUpdates,
        });
      }
    }

    // Actualizar campos del storeProduct
    const spUpdates: Record<string, number | null> = {};
    if (price !== undefined)    spUpdates.price = Number(price);
    if (minStock !== undefined) spUpdates.minStock = minStock !== '' && minStock !== null ? Number(minStock) : null;

    const updated = await prisma.storeProduct.update({
      where: { id },
      data: spUpdates,
      include: { product: true },
    });

    // Sincronizar cambios al catálogo cloud en segundo plano (solo productos locales)
    if (!storeProduct.product.isGlobal) {
      syncProductToCatalog({
        name: updated.product.name,
        brand: updated.product.brand,
        content: updated.product.content,
        category: updated.product.category,
        barcode: updated.product.barcode,
        imageUrl: updated.product.imageUrl,
        unitType: updated.product.unitType,
        sourceStoreId: user.storeId,
      });
    }

    return NextResponse.json({ storeProduct: updated });
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: 'Error al actualizar producto' },
      { status: 500 }
    );
  }
}
