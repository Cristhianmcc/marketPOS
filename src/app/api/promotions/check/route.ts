import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { applyBestPromotion, type Promotion } from '@/lib/promotions';
import { isFeatureEnabled } from '@/lib/featureFlags'; // ✅ MÓDULO 15: Feature Flags

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { productId, quantity, unitPrice } = await request.json();

    if (!productId || !quantity || !unitPrice) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: 'productId, quantity y unitPrice son requeridos' },
        { status: 400 }
      );
    }

    // ✅ MÓDULO 15: Verificar si las promociones están habilitadas
    const enablePromotions = await isFeatureEnabled(session.storeId, 'ENABLE_PROMOTIONS' as any);
    if (!enablePromotions) {
      // Si las promociones están deshabilitadas, retornar null (sin promoción)
      return NextResponse.json({
        promotion: null,
      });
    }

    // Obtener promociones activas
    const promotions = await prisma.promotion.findMany({
      where: {
        storeId: session.storeId,
        active: true,
      },
    });

    // Convertir a formato usado por applyBestPromotion
    const promoList: Promotion[] = promotions.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      active: p.active,
      productId: p.productId,
      minQty: p.minQty,
      packPrice: p.packPrice ? Number(p.packPrice) : null,
      happyStart: p.happyStart,
      happyEnd: p.happyEnd,
      happyPrice: p.happyPrice ? Number(p.happyPrice) : null,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
    }));

    const subtotal = quantity * unitPrice;
    const appliedPromo = applyBestPromotion(productId, quantity, unitPrice, subtotal, promoList);

    return NextResponse.json({
      promotion: appliedPromo || null,
    });
  } catch (error) {
    console.error('Error checking promotions:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al verificar promociones' },
      { status: 500 }
    );
  }
}
