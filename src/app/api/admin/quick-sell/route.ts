// src/app/api/admin/quick-sell/route.ts
// ✅ MÓDULO 17.2: Admin API - Configuración de productos rápidos
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

// ✅ GET - Obtener todos los productos con info de quick sell
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // ✅ Obtener productos con conteo de ventas
    const storeProducts = await prisma.storeProduct.findMany({
      where: {
        storeId: user.storeId,
        active: true,
      },
      select: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            isQuickSell: true,
            quickSellOrder: true,
          },
        },
        price: true,
        saleItems: {
          select: {
            id: true,
          },
        },
      },
    });

    const products = storeProducts.map(sp => ({
      id: sp.product.id,
      name: sp.product.name,
      price: sp.price,
      category: sp.product.category,
      isQuickSell: sp.product.isQuickSell,
      quickSellOrder: sp.product.quickSellOrder,
      totalSold: sp.saleItems.length,
    }));

    return NextResponse.json({ products });
  } catch (error) {
    console.error('[Quick Sell Admin API] Error:', error);
    return NextResponse.json(
      { error: 'Error al cargar productos' },
      { status: 500 }
    );
  }
}

// ✅ PATCH - Toggle isQuickSell de un producto
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { productId, isQuickSell } = await req.json();

    if (!productId || typeof isQuickSell !== 'boolean') {
      return NextResponse.json(
        { error: 'Datos inválidos' },
        { status: 400 }
      );
    }

    // ✅ Si se está marcando como quick sell, obtener el siguiente orden
    let quickSellOrder = null;
    if (isQuickSell) {
      const maxOrder = await prisma.productMaster.aggregate({
        where: {
          isQuickSell: true,
        },
        _max: {
          quickSellOrder: true,
        },
      });
      quickSellOrder = (maxOrder._max.quickSellOrder || 0) + 1;
    }

    // ✅ Actualizar producto
    await prisma.productMaster.update({
      where: { id: productId },
      data: {
        isQuickSell,
        quickSellOrder: isQuickSell ? quickSellOrder : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Quick Sell Admin API] Error:', error);
    return NextResponse.json(
      { error: 'Error al actualizar producto' },
      { status: 500 }
    );
  }
}
