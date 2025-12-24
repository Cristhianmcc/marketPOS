// app/api/admin/users/[id]/reset-password/route.ts
// OWNER: Resetear contraseña de usuarios

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { generateTemporaryPassword } from '@/lib/superadmin';
import bcrypt from 'bcrypt';

export async function POST(
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

    // Obtener nueva contraseña del body
    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 6) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Actualizar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      message: 'Contraseña actualizada',
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al resetear contraseña' },
      { status: 500 }
    );
  }
}
