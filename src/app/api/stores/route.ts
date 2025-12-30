// src/app/api/stores/route.ts
// Endpoint para listar tiendas (solo SUPERADMIN)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getCurrentUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';

/**
 * GET /api/stores
 * Lista todas las tiendas
 * Auth: SUPERADMIN
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo SUPERADMIN puede listar todas las tiendas
    const isSuper = await isSuperAdmin(user.email);
    if (!isSuper) {
      return NextResponse.json(
        { error: 'No tienes permisos para listar tiendas' },
        { status: 403 }
      );
    }

    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({ stores });
  } catch (error) {
    console.error('Error fetching stores:', error);
    return NextResponse.json(
      { error: 'Error al obtener tiendas' },
      { status: 500 }
    );
  }
}
