// Permite al SUPERADMIN adoptar temporalmente el OWNER de una tienda activa.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setSession, getCurrentUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'SUPERADMIN' && !isSuperAdmin(user.email)) {
      return NextResponse.json(
        { error: 'No autorizado. Solo SUPERADMIN puede acceder como OWNER.' },
        { status: 403 }
      );
    }

    const { storeId, userId } = await request.json();

    if (typeof storeId !== 'string' || !storeId.trim()) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 });
    }

    if (userId !== undefined && (typeof userId !== 'string' || !userId.trim())) {
      return NextResponse.json({ error: 'userId inválido' }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        users: {
          where: { role: 'OWNER', active: true },
          take: 1,
        },
      },
    });

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
    }

    if (store.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'No se puede acceder a una tienda archivada' },
        { status: 409 }
      );
    }

    let targetUser = store.users[0];
    if (userId) {
      targetUser = await prisma.user.findFirst({
        where: {
          id: userId,
          storeId: store.id,
          role: 'OWNER',
          active: true,
        },
      }) ?? undefined;
    }

    if (!targetUser) {
      return NextResponse.json(
        { error: 'OWNER activo no encontrado para esta tienda' },
        { status: 404 }
      );
    }

    await setSession({
      userId: targetUser.id,
      storeId: store.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
    });

    console.info(`[switch-store] SUPERADMIN accedió al OWNER de store=${store.id}`);

    return NextResponse.json({
      success: true,
      store: {
        id: store.id,
        name: store.name,
      },
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
      },
    });
  } catch (error) {
    console.error('[switch-store] Error:', error);
    return NextResponse.json(
      { error: 'Error al cambiar de tienda' },
      { status: 500 }
    );
  }
}
