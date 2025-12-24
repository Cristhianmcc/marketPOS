// app/api/admin/users/[id]/toggle/route.ts
// OWNER: Activar/desactivar usuarios

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    // Verificar que el usuario pertenece a la misma tienda
    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return NextResponse.json(
        { code: 'NOT_FOUND', message: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    if (targetUser.storeId !== session.storeId) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    // No permitir que el owner se desactive a sí mismo
    if (targetUser.id === session.userId) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'No puedes desactivarte a ti mismo' },
        { status: 400 }
      );
    }

    // Toggle active
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { active: !targetUser.active },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Error toggling user:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al actualizar usuario' },
      { status: 500 }
    );
  }
}
