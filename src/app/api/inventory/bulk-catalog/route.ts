import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.storeId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { productIds, action } = await req.json();

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'No se enviaron productos' }, { status: 400 });
    }

    const publishInCatalog = action === 'publish';

    if (publishInCatalog) {
      // Al publicar masivamente, sincronizamos los campos del catálogo con los campos base del producto
      // para que aparezcan con su nombre, categoría e imagen original por defecto.
      const products = await prisma.storeProduct.findMany({
        where: { id: { in: productIds } },
        include: { product: true }
      });

      for (const sp of products) {
        await prisma.storeProduct.update({
          where: { id: sp.id },
          data: {
            publishInCatalog: true,
            catalogVisible: true,
            catalogTitle: sp.product.name,
            catalogCategory: sp.product.category,
            catalogImagePath: sp.product.imageUrl,
            catalogUpdatedAt: new Date()
          }
        });
      }
    } else {
      await prisma.storeProduct.updateMany({
        where: {
          id: { in: productIds },
          storeId: session.storeId,
        },
        data: {
          publishInCatalog: false,
          catalogVisible: false,
        },
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: `${productIds.length} productos ${publishInCatalog ? 'añadidos' : 'quitados'} del catálogo` 
    });
  } catch (error) {
    console.error('Error in bulk catalog action:', error);
    return NextResponse.json({ error: 'Error al realizar la acción masiva' }, { status: 500 });
  }
}
