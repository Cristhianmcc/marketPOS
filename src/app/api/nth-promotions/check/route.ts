import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { computeNthPromoDiscount } from '@/lib/nthPromotions';

/**
 * API para verificar si aplica promoción N-ésimo a un producto
 * Llamado desde el POS para calcular descuentos en tiempo real
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      productId,
      quantity,
      unitPrice,
      unitType,
      baseAfterPreviousPromos,
    } = body;

    // Validaciones básicas
    if (!productId || !quantity || !unitPrice || !baseAfterPreviousPromos) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    // Buscar promoción n-ésimo activa para el producto
    const nthPromotion = await prisma.nthPromotion.findFirst({
      where: {
        storeId: session.storeId,
        productId,
        active: true,
      },
      orderBy: {
        createdAt: 'desc', // Si hay múltiples, tomar la más reciente
      },
    });

    if (!nthPromotion) {
      return NextResponse.json({ nthPromotion: null });
    }

    // Calcular descuento usando la librería
    const result = computeNthPromoDiscount({
      quantity,
      unitPrice,
      baseAfterPreviousPromos,
      nthPromotion: {
        id: nthPromotion.id,
        name: nthPromotion.name,
        type: nthPromotion.type,
        nthQty: nthPromotion.nthQty,
        percentOff: nthPromotion.percentOff,
        startsAt: nthPromotion.startsAt,
        endsAt: nthPromotion.endsAt,
        active: nthPromotion.active,
      },
      unitType,
    });

    if (!result) {
      return NextResponse.json({ nthPromotion: null });
    }

    // Devolver descuento calculado
    return NextResponse.json({
      nthPromotion: {
        nthPromoName: result.snapshot.nthPromoName,
        nthPromoQty: result.snapshot.nthPromoQty,
        nthPromoPercent: Number(result.snapshot.nthPromoPercent),
        nthPromoDiscount: result.discountAmount,
      },
    });
  } catch (error) {
    console.error('Error checking nth promotion:', error);
    return NextResponse.json(
      { error: 'Error al verificar promoción n-ésimo' },
      { status: 500 }
    );
  }
}
