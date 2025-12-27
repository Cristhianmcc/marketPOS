import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

// PATCH - Actualizar estado activo de promoción
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { active } = body;

    if (typeof active !== 'boolean') {
      return NextResponse.json({ error: 'El campo active es requerido' }, { status: 400 });
    }

    // Verificar que la promoción existe y pertenece a la tienda
    const existingPromo = await prisma.volumePromotion.findUnique({
      where: { id },
    });

    if (!existingPromo) {
      return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 });
    }

    if (existingPromo.storeId !== session.storeId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Actualizar
    const updatedPromo = await prisma.volumePromotion.update({
      where: { id },
      data: { active },
    });

    return NextResponse.json({ volumePromotion: updatedPromo });
  } catch (error) {
    console.error('Error al actualizar promoción:', error);
    return NextResponse.json(
      { error: 'Error al actualizar promoción' },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar promoción
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await params;

    // Verificar que la promoción existe y pertenece a la tienda
    const existingPromo = await prisma.volumePromotion.findUnique({
      where: { id },
    });

    if (!existingPromo) {
      return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 });
    }

    if (existingPromo.storeId !== session.storeId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Eliminar
    await prisma.volumePromotion.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Promoción eliminada' });
  } catch (error) {
    console.error('Error al eliminar promoción:', error);
    return NextResponse.json(
      { error: 'Error al eliminar promoción' },
      { status: 500 }
    );
  }
}
