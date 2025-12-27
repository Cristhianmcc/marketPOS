import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { computeCategoryPromoDiscount } from '@/lib/categoryPromotions';

/**
 * POST /api/category-promotions/check
 * Verifica y calcula la mejor promoción por categoría aplicable a un producto
 * Usado por el POS para preview de descuentos automáticos
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { productCategory, quantity, unitPrice, subtotalAfterProductPromo } = await request.json();

    // Validaciones
    if (!productCategory || quantity == null || unitPrice == null || subtotalAfterProductPromo == null) {
      return NextResponse.json(
        { 
          code: 'INVALID_REQUEST', 
          message: 'productCategory, quantity, unitPrice y subtotalAfterProductPromo son requeridos' 
        },
        { status: 400 }
      );
    }

    // Calcular promoción por categoría
    const result = await computeCategoryPromoDiscount({
      storeId: session.storeId!,
      productCategory,
      quantity,
      unitPrice,
      subtotalAfterProductPromo,
      nowLocalLima: new Date(),
    });

    if (!result) {
      return NextResponse.json({
        categoryPromotion: null,
      });
    }

    return NextResponse.json({
      categoryPromotion: {
        categoryPromoName: result.promoSnapshot.name,
        categoryPromoType: result.promoSnapshot.type,
        categoryPromoDiscount: result.discountAmount,
      },
    });
  } catch (error) {
    console.error('Error checking category promotions:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al verificar promociones por categoría' },
      { status: 500 }
    );
  }
}
