import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';

// GET - Listar promociones por volumen
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const volumePromotions = await prisma.volumePromotion.findMany({
      where: { storeId: session.storeId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            barcode: true,
            unitType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ volumePromotions });
  } catch (error) {
    console.error('Error al obtener promociones por volumen:', error);
    return NextResponse.json(
      { error: 'Error al obtener promociones por volumen' },
      { status: 500 }
    );
  }
}

// POST - Crear promoción por volumen
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { name, productId, requiredQty, packPrice, startsAt, endsAt } = body;

    // Validaciones
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    if (!productId) {
      return NextResponse.json({ error: 'El producto es requerido' }, { status: 400 });
    }

    if (!requiredQty || requiredQty < 2) {
      return NextResponse.json(
        { error: 'La cantidad requerida debe ser al menos 2' },
        { status: 400 }
      );
    }

    if (!packPrice || packPrice <= 0) {
      return NextResponse.json(
        { error: 'El precio del pack debe ser mayor a 0' },
        { status: 400 }
      );
    }

    // Verificar que el producto existe y es UNIT
    const product = await prisma.productMaster.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    if (product.unitType !== 'UNIT') {
      return NextResponse.json(
        { error: 'Solo se pueden crear promociones para productos tipo UNIT' },
        { status: 400 }
      );
    }

    // Crear promoción
    const volumePromotion = await prisma.volumePromotion.create({
      data: {
        storeId: session.storeId,
        name: name.trim(),
        productId,
        type: 'FIXED_PRICE',
        requiredQty,
        packPrice: new Prisma.Decimal(packPrice),
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        active: true,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            barcode: true,
            unitType: true,
          },
        },
      },
    });

    return NextResponse.json({ volumePromotion }, { status: 201 });
  } catch (error) {
    console.error('Error al crear promoción por volumen:', error);
    return NextResponse.json(
      { error: 'Error al crear promoción por volumen' },
      { status: 500 }
    );
  }
}
