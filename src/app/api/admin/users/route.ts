// app/api/admin/users/route.ts
// OWNER: Listar y crear cajeros de su tienda

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { generateTemporaryPassword } from '@/lib/superadmin';
import bcrypt from 'bcrypt';
import { checkRateLimit, getClientIP } from '@/lib/rateLimit'; // ✅ MÓDULO S8

// GET /api/admin/users - Listar usuarios de la tienda (OWNER)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede acceder
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      where: { storeId: session.storeId },
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
    // ✅ MÓDULO S8: Rate limit user creation
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit('admin-user-create', clientIP);
    
    if (!rateLimitResult.allowed) {
      const waitSeconds = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { code: 'TOO_MANY_REQUESTS', message: `Demasiadas solicitudes. Intenta en ${waitSeconds}s` },
        { status: 429, headers: { 'Retry-After': String(waitSeconds) } }
      );
    }

    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'Nombre, email y contraseña son requeridos' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'La contraseña debe tener al menos 6 caracteres' },
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
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear cajero
    const user = await prisma.user.create({
      data: {
        storeId: session.storeId,
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
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al crear usuario' },
      { status: 500 }
    );
  }
}
