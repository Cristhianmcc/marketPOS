import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

const SUPERADMIN_EMAILS = process.env.SUPERADMIN_EMAILS?.split(',').map(e => e.trim()) || [];

export async function PATCH(
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
        { error: 'No autorizado. Solo SUPERADMIN puede cambiar emails de dueños.' },
        { status: 403 }
      );
    }

    const { id: storeId } = params;
    const body = await request.json();
    const { email: newEmail } = body;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newEmail || !emailRegex.test(newEmail)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    // Find OWNER user for this store
    const owner = await prisma.user.findFirst({
      where: {
        storeId,
        role: 'OWNER',
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'No se encontró el dueño de esta tienda' },
        { status: 404 }
      );
    }

    // Check if new email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser && existingUser.id !== owner.id) {
      return NextResponse.json(
        { error: 'EMAIL_ALREADY_EXISTS', message: 'Este email ya está en uso' },
        { status: 409 }
      );
    }

    // Update owner email
    await prisma.user.update({
      where: { id: owner.id },
      data: { email: newEmail },
    });

    return NextResponse.json({
      success: true,
      oldEmail: owner.email,
      newEmail,
      message: `Email del dueño actualizado de ${owner.email} a ${newEmail}`,
    });
  } catch (error) {
    console.error('Error updating owner email:', error);
    return NextResponse.json(
      { error: 'Error al actualizar email del dueño' },
      { status: 500 }
    );
  }
}
