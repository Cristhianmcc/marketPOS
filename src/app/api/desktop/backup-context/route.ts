import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { hasValidDesktopInternalToken } from '@/lib/desktopInternalAuth';

/**
 * Contexto minimo para que Electron respalde todas las tiendas activas sin
 * depender de una sesion abierta en el renderer.
 */
export async function GET(request: NextRequest) {
  if (!hasValidDesktopInternalToken(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const stores = await prisma.store.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        ruc: true,
        address: true,
        phone: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ stores });
  } catch (error) {
    console.error('[desktop/backup-context] Error:', error);
    return NextResponse.json({ error: 'No se pudo consultar las tiendas activas' }, { status: 500 });
  }
}
