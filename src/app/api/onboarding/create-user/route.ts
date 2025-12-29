// src/app/api/onboarding/create-user/route.ts
// ✅ MÓDULO 16.2: Onboarding - Crear cajero durante onboarding

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { createAuditLog } from '@/domain/audit-log/audit-log-service';
import bcrypt from 'bcryptjs';

/**
 * POST /api/onboarding/create-user
 * Crea un cajero durante el onboarding
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    // Solo OWNER
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede crear usuarios' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email, password, role = 'CASHIER' } = body;

    // Validaciones
    if (!name || name.trim().length < 3) {
      return NextResponse.json(
        { error: 'El nombre debe tener al menos 3 caracteres' },
        { status: 400 }
      );
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Verificar que el email no exista
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'El email ya está en uso' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await prisma.user.create({
      data: {
        storeId: session.storeId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: role === 'OWNER' ? 'OWNER' : 'CASHIER', // Solo permitir OWNER o CASHIER
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Auditoría
    await createAuditLog({
      storeId: session.storeId,
      userId: session.userId,
      action: 'CASHIER_CREATED_DURING_ONBOARDING',
      entityType: 'USER',
      entityId: user.id,
      severity: 'INFO',
      meta: {
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
      },
    });

    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear usuario' },
      { status: 500 }
    );
  }
}
