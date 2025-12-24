// app/api/admin/stores/route.ts
// SUPERADMIN: Crear y listar stores

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin, generateTemporaryPassword } from '@/lib/superadmin';
import bcrypt from 'bcrypt';

// GET /api/admin/stores - Listar todas las tiendas (SUPERADMIN)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!isSuperAdmin(session.user.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const stores = await prisma.store.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            storeProducts: true,
          },
        },
      },
    });

    return NextResponse.json({ stores });
  } catch (error) {
    console.error('Error fetching stores:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener tiendas' },
      { status: 500 }
    );
  }
}

// POST /api/admin/stores - Crear nueva tienda + owner (SUPERADMIN)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!isSuperAdmin(session.user.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { storeName, storeRuc, storeAddress, storePhone, ownerName, ownerEmail } = body;

    // Validaciones
    if (!storeName || !ownerName || !ownerEmail) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'Nombre de tienda, nombre y email del owner son requeridos' },
        { status: 400 }
      );
    }

    // Verificar email único
    const existingUser = await prisma.user.findUnique({
      where: { email: ownerEmail },
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

    // Crear Store + Settings + Owner en transacción
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear Store
      const store = await tx.store.create({
        data: {
          name: storeName,
          ruc: storeRuc || null,
          address: storeAddress || null,
          phone: storePhone || null,
        },
      });

      // 2. Crear StoreSettings por defecto
      await tx.storeSettings.create({
        data: {
          storeId: store.id,
          ticketFooter: 'Gracias por su compra',
          taxRate: 0,
        },
      });

      // 3. Crear Owner
      const owner = await tx.user.create({
        data: {
          storeId: store.id,
          email: ownerEmail,
          name: ownerName,
          password: hashedPassword,
          role: 'OWNER',
          active: true,
        },
      });

      return { store, owner, temporaryPassword };
    });

    return NextResponse.json({
      success: true,
      store: result.store,
      owner: {
        id: result.owner.id,
        email: result.owner.email,
        name: result.owner.name,
        temporaryPassword: result.temporaryPassword, // Mostrar SOLO una vez
      },
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating store:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al crear tienda' },
      { status: 500 }
    );
  }
}
