// app/api/admin/users/route.ts
// OWNER: Listar y crear cajeros de su tienda

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { generateTemporaryPassword } from '@/lib/superadmin';
import bcrypt from 'bcrypt';

// GET /api/admin/users - Listar usuarios de la tienda (OWNER)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id || !session.user.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede acceder
    if (session.user.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      where: { storeId: session.user.storeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener usuarios' },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Crear cajero (OWNER)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id || !session.user.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email } = body;

    if (!name || !email) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'Nombre y email son requeridos' },
        { status: 400 }
      );
    }

    // Verificar email único
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { code: 'CONFLICT', message: 'El email ya está registrado' },
        { status: 409 }
      );
    }

    // Generar password temporal
    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Crear cajero
    const user = await prisma.user.create({
      data: {
        storeId: session.user.storeId,
        email,
        name,
        password: hashedPassword,
        role: 'CASHIER',
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    return NextResponse.json({
      success: true,
      user,
      temporaryPassword, // Mostrar SOLO una vez
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al crear usuario' },
      { status: 500 }
    );
  }
}
