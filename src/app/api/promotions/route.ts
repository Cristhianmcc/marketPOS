import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';

// GET - List promotions
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId || session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo el propietario puede ver promociones' },
        { status: 403 }
      );
    }

    const promotions = await prisma.promotion.findMany({
      where: {
        storeId: session.storeId,
      },
      include: {
        product: {
          select: {
            name: true,
            content: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ promotions });
  } catch (error) {
    console.error('Error listing promotions:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al listar promociones' },
      { status: 500 }
    );
  }
}

// POST - Create promotion
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId || session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo el propietario puede crear promociones' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      type, 
      name, 
      productId, 
      minQty, 
      packPrice, 
      happyStart, 
      happyEnd, 
      happyPrice,
      startsAt,
      endsAt,
    } = body;

    // Validaciones básicas
    if (!type || !name) {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'Tipo y nombre son requeridos' },
        { status: 400 }
      );
    }

    // Validaciones según tipo
    if (type === 'TWO_FOR_ONE' || type === 'PACK_PRICE') {
      if (!minQty || minQty < 2) {
        return NextResponse.json(
          { code: 'INVALID_INPUT', message: 'Cantidad mínima debe ser >= 2' },
          { status: 400 }
        );
      }
    }

    if (type === 'PACK_PRICE' && (!packPrice || packPrice <= 0)) {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'Precio del pack es requerido' },
        { status: 400 }
      );
    }

    if (type === 'HAPPY_HOUR') {
      if (!happyStart || !happyEnd || !happyPrice) {
        return NextResponse.json(
          { code: 'INVALID_INPUT', message: 'Happy hour requiere hora inicio, fin y precio' },
          { status: 400 }
        );
      }
    }

    const promotion = await prisma.promotion.create({
      data: {
        storeId: session.storeId,
        type,
        name,
        productId: productId || null,
        minQty: minQty ? parseInt(minQty) : null,
        packPrice: packPrice ? new Prisma.Decimal(packPrice) : null,
        happyStart: happyStart ? new Date(happyStart) : null,
        happyEnd: happyEnd ? new Date(happyEnd) : null,
        happyPrice: happyPrice ? new Prisma.Decimal(happyPrice) : null,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        active: true,
      },
    });

    return NextResponse.json({ promotion }, { status: 201 });
  } catch (error) {
    console.error('Error creating promotion:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al crear promoción' },
      { status: 500 }
    );
  }
}
