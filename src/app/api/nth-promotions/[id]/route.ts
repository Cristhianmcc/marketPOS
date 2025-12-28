import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';

/**
 * PUT /api/nth-promotions/[id]
 * Actualiza una promoción n-ésimo existente
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, nthQty, percentOff, startsAt, endsAt, active } = body;

    // Verificar que la promoción existe y pertenece a la tienda
    const existing = await prisma.nthPromotion.findUnique({
      where: { id },
    });

    if (!existing || existing.storeId !== session.storeId) {
      return NextResponse.json(
        { error: 'Promoción no encontrada' },
        { status: 404 }
      );
    }

    // Validaciones
    if (nthQty !== undefined && nthQty < 2) {
      return NextResponse.json(
        { error: 'nthQty debe ser >= 2' },
        { status: 400 }
      );
    }

    if (percentOff !== undefined && (percentOff <= 0 || percentOff > 100)) {
      return NextResponse.json(
        { error: 'percentOff debe estar entre 0 y 100' },
        { status: 400 }
      );
    }

    // Actualizar promoción
    const promotion = await prisma.nthPromotion.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(nthQty && { nthQty: parseInt(nthQty) }),
        ...(percentOff && { percentOff: new Prisma.Decimal(percentOff) }),
        ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : null }),
        ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : null }),
        ...(active !== undefined && { active }),
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

    return NextResponse.json({ promotion });
  } catch (error) {
    console.error('Error updating nth promotion:', error);
    return NextResponse.json(
      { error: 'Error al actualizar promoción' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/nth-promotions/[id]
 * Elimina una promoción n-ésimo
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;

    // Verificar que la promoción existe y pertenece a la tienda
    const existing = await prisma.nthPromotion.findUnique({
      where: { id },
    });

    if (!existing || existing.storeId !== session.storeId) {
      return NextResponse.json(
        { error: 'Promoción no encontrada' },
        { status: 404 }
      );
    }

    // Eliminar promoción
    await prisma.nthPromotion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting nth promotion:', error);
    return NextResponse.json(
      { error: 'Error al eliminar promoción' },
      { status: 500 }
    );
  }
}
