import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';

/**
 * GET /api/nth-promotions
 * Lista todas las promociones n-ésimo de la tienda
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const promotions = await prisma.nthPromotion.findMany({
      where: { storeId: session.storeId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            category: true,
            unitType: true,
            barcode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ promotions });
  } catch (error) {
    console.error('Error fetching nth promotions:', error);
    return NextResponse.json(
      { error: 'Error al obtener promociones' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/nth-promotions
 * Crea una nueva promoción n-ésimo
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { name, productId, nthQty, percentOff, startsAt, endsAt, active } = body;

    // Validaciones
    if (!name || !productId || !nthQty || !percentOff) {
      return NextResponse.json(
        { error: 'Campos requeridos: name, productId, nthQty, percentOff' },
        { status: 400 }
      );
    }

    // Validar nthQty >= 2
    if (nthQty < 2) {
      return NextResponse.json(
        { error: 'nthQty debe ser >= 2' },
        { status: 400 }
      );
    }

    // Validar percentOff entre 0 y 100
    if (percentOff <= 0 || percentOff > 100) {
      return NextResponse.json(
        { error: 'percentOff debe estar entre 0 y 100' },
        { status: 400 }
      );
    }

    // Verificar que el producto existe y es UNIT
    const product = await prisma.productMaster.findUnique({
      where: { id: productId },
      select: { unitType: true },
    });

    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      );
    }

    if (product.unitType !== 'UNIT') {
      return NextResponse.json(
        { error: 'Solo se permiten promociones n-ésimo para productos UNIT' },
        { status: 400 }
      );
    }

    // Crear promoción
    const promotion = await prisma.nthPromotion.create({
      data: {
        storeId: session.storeId,
        name,
        productId,
        type: 'NTH_PERCENT',
        nthQty: parseInt(nthQty),
        percentOff: new Prisma.Decimal(percentOff),
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        active: active !== undefined ? active : true,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            category: true,
            unitType: true,
          },
        },
      },
    });

    return NextResponse.json({ promotion }, { status: 201 });
  } catch (error) {
    console.error('Error creating nth promotion:', error);
    return NextResponse.json(
      { error: 'Error al crear promoción' },
      { status: 500 }
    );
  }
}
