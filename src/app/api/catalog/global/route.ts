import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

/**
 * GET /api/catalog/global
 * Lista productos del catálogo global (isGlobal = true)
 * Auth: OWNER
 * Query params: q, category, unitType, hasBarcode, limit, cursor
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Solo OWNER puede ver el catálogo global
    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede acceder al catálogo global' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';
    const unitType = searchParams.get('unitType') || '';
    const hasBarcode = searchParams.get('hasBarcode') || '';
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const cursor = searchParams.get('cursor') || '';

    // Construir filtros
    const where: any = {
      isGlobal: true,
    };

    if (q) {
      where.name = {
        contains: q,
        mode: 'insensitive',
      };
    }

    if (category) {
      where.category = {
        equals: category,
        mode: 'insensitive',
      };
    }

    if (unitType) {
      where.unitType = unitType;
    }

    if (hasBarcode === 'true') {
      where.barcode = { not: null };
    } else if (hasBarcode === 'false') {
      where.barcode = null;
    }

    // Paginación con cursor
    const queryOptions: any = {
      where,
      take: limit,
      orderBy: [{ name: 'asc' }],
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
        createdAt: true,
        updatedAt: true,
        createdByStore: {
          select: {
            name: true,
          },
        },
      },
    };

    if (cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = { id: cursor };
    }

    const products = await prisma.productMaster.findMany(queryOptions);

    // Verificar qué productos ya están importados en la tienda del usuario
    const productIds = products.map((p: { id: string }) => p.id);
    const existingStoreProducts = await prisma.storeProduct.findMany({
      where: {
        storeId: user.storeId,
        productId: { in: productIds },
      },
      select: {
        productId: true,
      },
    });

    const importedProductIds = new Set(
      existingStoreProducts.map((sp: { productId: string }) => sp.productId)
    );

    // Agregar flag "alreadyImported" a cada producto
    const productsWithImportFlag = products.map((p: any) => ({
      ...p,
      alreadyImported: importedProductIds.has(p.id),
    }));

    // Siguiente cursor
    const nextCursor =
      products.length === limit ? products[products.length - 1].id : null;

    return NextResponse.json({
      products: productsWithImportFlag,
      nextCursor,
    });
  } catch (error) {
    console.error('Error fetching global catalog:', error);
    return NextResponse.json(
      { error: 'Error al cargar catálogo global' },
      { status: 500 }
    );
  }
}
