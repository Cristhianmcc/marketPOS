import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { hash } from 'bcryptjs';

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
        { error: 'No autorizado. Solo SUPERADMIN puede resetear passwords.' },
        { status: 403 }
      );
    }

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
    const tempPassword = `Temp${Math.random().toString(36).slice(2, 10)}!`;
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
