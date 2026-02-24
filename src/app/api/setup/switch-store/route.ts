// src/app/api/setup/switch-store/route.ts
// Actualiza la sesión del usuario para asociarlo a una tienda local

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setSession, getCurrentUser } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { storeId, userId } = await request.json();

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 });
    }

    // Verificar que la tienda existe
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        users: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    });

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
    }

    // Si se especifica userId, verificar que existe
    let targetUser = store.users[0]; // Por defecto el owner
    if (userId) {
      const foundUser = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (foundUser) {
        targetUser = foundUser;
      }
    }

    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Actualizar la sesión con el nuevo storeId
    await setSession({
      userId: targetUser.id,
      storeId: store.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
    });

    console.log(`[switch-store] Session updated: user=${targetUser.email}, store=${store.name}`);

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
