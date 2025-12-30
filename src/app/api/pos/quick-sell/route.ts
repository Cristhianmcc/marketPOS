// src/app/api/pos/quick-sell/route.ts
// ✅ MÓDULO 17.2: Quick Sell POS - Productos rápidos para venta
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

// ✅ GET /api/pos/quick-sell - Obtener productos rápidos para POS
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '8', 10);

    // ✅ Obtener SOLO productos rápidos configurados manualmente
    const configuredProducts = await prisma.storeProduct.findMany({
      where: {
        storeId: user.storeId,
        active: true,
        product: {
          isQuickSell: true,
        },
      },
      select: {
        id: true,
        price: true,
        stock: true,
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            category: true,
          },
        },
      },
      orderBy: {
        product: {
          quickSellOrder: 'asc',
        },
      },
      take: limit,
    });

    // ✅ Retornar SOLO los productos marcados manualmente
    const finalProducts = configuredProducts;

    // ✅ Formatear respuesta - Solo productos marcados manualmente
    const quickSellProducts = finalProducts.map(sp => ({
      id: sp.product.id,
      name: sp.product.name,
      price: sp.price,
      stock: sp.stock,
      imageUrl: sp.product.imageUrl,
      category: sp.product.category,
      isQuickSell: true,
      totalSold: 0,
    }));

    return NextResponse.json(quickSellProducts);
  } catch (error) {
    console.error('[Quick Sell API] Error:', error);
    return NextResponse.json(
      { error: 'Error al cargar productos rápidos' },
      { status: 500 }
    );
  }
}

