import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

const MAX_PRODUCTS = 5000;

/**
 * POST /api/inventory/bulk-catalog
 * Publica o retira del catálogo web varios productos de la tienda actual.
 * Auth: OWNER (igual que editar un producto). Todas las lecturas y escrituras
 * se limitan a `session.storeId`; si algún id no pertenece a la tienda no se
 * modifica nada y se responde 404.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.storeId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.role !== 'OWNER') {
    return NextResponse.json({ error: 'Solo el propietario puede modificar el catálogo' }, { status: 403 });
  }
  const storeId = session.storeId;

  let body: { productIds?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const { productIds, action } = body ?? {};
  if (action !== 'publish' && action !== 'unpublish') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  }
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json({ error: 'No se enviaron productos' }, { status: 400 });
  }
  if (productIds.length > MAX_PRODUCTS || !productIds.every((id) => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json({ error: 'Lista de productos inválida' }, { status: 400 });
  }
  const ids = [...new Set(productIds as string[])];
  const publishInCatalog = action === 'publish';

  try {
    const products = await prisma.storeProduct.findMany({
      where: { id: { in: ids }, storeId },
      select: { id: true, product: { select: { name: true, category: true, imageUrl: true } } },
    });
    if (products.length !== ids.length) {
      return NextResponse.json({ error: 'Algunos productos no existen en esta tienda' }, { status: 404 });
    }

    if (publishInCatalog) {
      const now = new Date();
      try {
        await prisma.$transaction(products.map((sp) => prisma.storeProduct.updateMany({
          where: { id: sp.id, storeId },
          data: {
            publishInCatalog: true,
            catalogVisible: true,
            catalogTitle: sp.product.name,
            catalogCategory: sp.product.category,
            catalogImagePath: sp.product.imageUrl,
            catalogUpdatedAt: now,
          },
        })));
      } catch {
        // BD antigua sin columnas de catálogo: marcar solo la publicación
        await prisma.storeProduct.updateMany({ where: { id: { in: ids }, storeId }, data: { publishInCatalog: true } });
      }
    } else {
      try {
        await prisma.storeProduct.updateMany({
          where: { id: { in: ids }, storeId },
          data: { publishInCatalog: false, catalogVisible: false },
        });
      } catch {
        await prisma.storeProduct.updateMany({ where: { id: { in: ids }, storeId }, data: { publishInCatalog: false } });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${ids.length} productos ${publishInCatalog ? 'añadidos' : 'quitados'} del catálogo`,
    });
  } catch (error) {
    console.error('Error in bulk catalog action:', error);
    return NextResponse.json({ error: 'Error al realizar la acción masiva' }, { status: 500 });
  }
}
