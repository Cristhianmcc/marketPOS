// src/app/api/store/route.ts
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const store = await prisma.store.findUnique({
      where: { id: user.storeId },
      select: {
        id: true,
        name: true,
        isDemoStore: true,
      },
    });

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ store });
  } catch (error) {
    console.error('[Store API] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener información de la tienda' },
      { status: 500 }
    );
  }
}
