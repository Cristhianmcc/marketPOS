import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId || session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo el propietario puede modificar promociones' },
        { status: 403 }
      );
    }

    const { active } = await request.json();

    const promotion = await prisma.promotion.update({
      where: {
        id: params.id,
        storeId: session.storeId,
      },
      data: {
        active,
      },
    });

    return NextResponse.json({ promotion });
  } catch (error) {
    console.error('Error updating promotion:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al actualizar promoción' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId || session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo el propietario puede eliminar promociones' },
        { status: 403 }
      );
    }

    await prisma.promotion.delete({
      where: {
        id: params.id,
        storeId: session.storeId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al eliminar promoción' },
      { status: 500 }
    );
  }
}
