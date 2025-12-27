import { NextRequest, NextResponse } from 'next/server';
import { getActiveVolumePromotion, computeVolumePackDiscount } from '@/lib/volumePromotions';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

/**
 * POST /api/volume-promotions/check
 * Verificar si aplica promoción por volumen a un producto
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { productId, quantity, unitPrice, unitType, subtotalAfterCategoryPromo } = body;

    // Validar campos requeridos
    if (!productId || quantity === undefined || !unitPrice || !unitType || subtotalAfterCategoryPromo === undefined) {
      return NextResponse.json({ 
        error: 'Faltan campos requeridos: productId, quantity, unitPrice, unitType, subtotalAfterCategoryPromo' 
      }, { status: 400 });
    }

    // Buscar promoción activa
    const volumePromotion = await getActiveVolumePromotion(
      prisma, 
      session.storeId, 
      productId
    );

    // Si no hay promoción, retornar null
    if (!volumePromotion) {
      return NextResponse.json({ volumePromotion: null });
    }

    // Calcular descuento
    const result = computeVolumePackDiscount({
      quantity,
      unitPrice,
      subtotalAfterCategoryPromo,
      volumePromotion,
      unitType,
    });

    // Si no aplica, retornar null
    if (!result) {
      return NextResponse.json({ volumePromotion: null });
    }

    // Retornar datos de la promoción aplicada
    return NextResponse.json({
      volumePromotion: {
        volumePromoName: result.snapshot.volumePromoName,
        volumePromoQty: result.snapshot.volumePromoQty,
        volumePromoDiscount: result.discountAmount,
      }
    });

  } catch (error) {
    console.error('Error checking volume promotion:', error);
    return NextResponse.json(
      { error: 'Error al verificar promoción por volumen' },
      { status: 500 }
    );
  }
}
