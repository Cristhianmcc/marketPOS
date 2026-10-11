import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { hash } from 'bcryptjs';
import { generateTemporaryPassword, isSuperAdmin } from '@/lib/superadmin';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session.isLoggedIn || !session.email) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Check SUPERADMIN
    if (session.role !== 'SUPERADMIN' && !isSuperAdmin(session.email)) {
      return NextResponse.json(
        { error: 'No autorizado. Solo SUPERADMIN puede resetear passwords.' },
        { status: 403 }
      );
    }

    const params = await props.params;
    const { id: storeId } = params;

    // Find OWNER user for this store
    const owner = await prisma.user.findFirst({
      where: {
        storeId,
        role: 'OWNER',
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'No se encontró el dueño de esta tienda' },
        { status: 404 }
      );
    }

    // Generate temporary password
    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await hash(tempPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: owner.id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      tempPassword,
      ownerEmail: owner.email,
      ownerName: owner.name,
      warning: '⚠️ IMPORTANTE: Esta contraseña temporal solo se muestra UNA VEZ. Entrégala al dueño de forma segura. El dueño debe cambiarla inmediatamente.',
      message: `Contraseña temporal generada para ${owner.email}`,
    });
  } catch (error) {
    console.error('Error resetting owner password:', error);
    return NextResponse.json(
      { error: 'Error al resetear contraseña del dueño' },
      { status: 500 }
    );
  }
}
