import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

/**
 * GET /api/products/suggest
 * Sugiere productos existentes por barcode o name
 * Auth: OWNER
 * Query: barcode? name?
 * Usado en formulario de crear producto para evitar duplicados
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede acceder a esta función' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get('barcode');
    const name = searchParams.get('name');

    let suggestions: any[] = [];

    // Búsqueda por barcode (exacta)
    if (barcode) {
      const product = await prisma.productMaster.findUnique({
        where: { barcode },
        select: {
          id: true,
          barcode: true,
          internalSku: true,
          name: true,
          brand: true,
          content: true,
          category: true,
          unitType: true,
          imageUrl: true,
          isGlobal: true,
          createdByStoreId: true,
        },
      });

      if (product) {
        // Verificar si ya está en la tienda del usuario
        const storeProduct = await prisma.storeProduct.findUnique({
          where: {
            storeId_productId: {
              storeId: user.storeId,
              productId: product.id,
            },
          },
        });

        suggestions.push({
          ...product,
          alreadyInStore: !!storeProduct,
          matchType: 'exact_barcode',
        });
      }
    }

    // Búsqueda por name (similar)
    if (name && name.length >= 3) {
      const products = await prisma.productMaster.findMany({
        where: {
          name: {
            contains: name,
            mode: 'insensitive',
          },
        },
        take: 10,
        orderBy: {
          name: 'asc',
        },
        select: {
          id: true,
          barcode: true,
          internalSku: true,
          name: true,
          brand: true,
          content: true,
          category: true,
          unitType: true,
          imageUrl: true,
          isGlobal: true,
          createdByStoreId: true,
        },
      });

      // Verificar cuáles ya están en la tienda
      const productIds = products.map((p: { id: string }) => p.id);
      const storeProducts = await prisma.storeProduct.findMany({
        where: {
          storeId: user.storeId,
          productId: { in: productIds },
        },
        select: {
          productId: true,
        },
      });

      const inStoreIds = new Set(storeProducts.map((sp: { productId: string }) => sp.productId));

      const nameSuggestions = products.map((p: any) => ({
        ...p,
        alreadyInStore: inStoreIds.has(p.id),
        matchType: 'name_contains',
      }));

      // Agregar solo si no están ya en suggestions (por barcode)
      const existingIds = new Set(suggestions.map((s: { id: string }) => s.id));
      nameSuggestions.forEach((s: any) => {
        if (!existingIds.has(s.id)) {
          suggestions.push(s);
        }
      });
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error fetching product suggestions:', error);
    return NextResponse.json(
      { error: 'Error al buscar sugerencias' },
      { status: 500 }
    );
  }
}
