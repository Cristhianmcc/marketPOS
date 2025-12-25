import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

const SUPERADMIN_EMAILS = process.env.SUPERADMIN_EMAILS?.split(',').map(e => e.trim()) || [];

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getIronSession<SessionData>(request, NextResponse.next(), {
      password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long_for_security',
      cookieName: 'market_pos_session',
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      },
    });

    if (!session.isLoggedIn || !session.email) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Check SUPERADMIN
    if (!SUPERADMIN_EMAILS.includes(session.email)) {
      return NextResponse.json(
        { error: 'No autorizado. Solo SUPERADMIN puede reactivar tiendas.' },
        { status: 403 }
      );
    }

    const storeId = params.id;

    // Validate store exists and is ARCHIVED
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, status: true },
    });

    if (!store) {
      return NextResponse.json(
        { error: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    if (store.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'La tienda ya está activa' },
        { status: 400 }
      );
    }

    // Reactivate store
    const updatedStore = await prisma.store.update({
      where: { id: storeId },
      data: {
        status: 'ACTIVE',
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Tienda "${updatedStore.name}" reactivada exitosamente`,
      store: updatedStore,
    });
  } catch (error) {
    console.error('Error reactivating store:', error);
    return NextResponse.json(
      { error: 'Error al reactivar tienda' },
      { status: 500 }
    );
  }
}
