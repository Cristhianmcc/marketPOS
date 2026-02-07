// app/api/admin/stores/route.ts
// SUPERADMIN: Crear y listar stores

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin, generateTemporaryPassword } from '@/lib/superadmin';
import { BusinessProfile } from '@prisma/client';
import { getProfileFlags } from '@/lib/businessProfiles';
import bcrypt from 'bcrypt';

// GET /api/admin/stores - Listar todas las tiendas (SUPERADMIN)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!isSuperAdmin(session.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    // Permitir filtrado de tiendas archivadas via query param
    const { searchParams } = new URL(request.url);
    const showArchived = searchParams.get('showArchived') === 'true';

    const stores = await prisma.store.findMany({
      where: showArchived ? {} : { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            storeProducts: true,
          },
        },
        featureFlags: {
          select: {
            key: true,
            enabled: true,
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

    if (!session?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!isSuperAdmin(session.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      storeName, 
      storeRuc, 
      storeAddress, 
      storePhone, 
      ownerName, 
      ownerEmail, 
      ownerPassword,
      businessProfile = 'BODEGA' // ✅ MÓDULO V1: Perfil de negocio
    } = body;

    // Validaciones
    if (!storeName || !ownerName || !ownerEmail || !ownerPassword) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'Nombre de tienda, nombre, email y contraseña del owner son requeridos' },
        { status: 400 }
      );
    }

    // Validar perfil de negocio
    const validProfiles = Object.values(BusinessProfile);
    if (!validProfiles.includes(businessProfile)) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: `Perfil de negocio inválido: ${businessProfile}` },
        { status: 400 }
      );
    }

    if (ownerPassword.length < 6) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'La contraseña debe tener al menos 6 caracteres' },
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

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(ownerPassword, 10);

    // Crear Store + Settings + Owner + Flags en transacción (SIN suscripción automática)
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear Store con perfil de negocio
      const store = await tx.store.create({
        data: {
          name: storeName,
          ruc: storeRuc || null,
          address: storeAddress || null,
          phone: storePhone || null,
          businessProfile: businessProfile as BusinessProfile, // ✅ MÓDULO V1
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

      // 4. ✅ MÓDULO V1: Aplicar preset de flags según el perfil
      const profileFlags = getProfileFlags(businessProfile as BusinessProfile);
      
      const flagUpserts = profileFlags.map(flagKey => 
        tx.featureFlag.upsert({
          where: {
            storeId_key: {
              storeId: store.id,
              key: flagKey,
            },
          },
          create: {
            storeId: store.id,
            key: flagKey,
            enabled: true,
          },
          update: {
            enabled: true,
          },
        })
      );
      
      await Promise.all(flagUpserts);

      // NOTA: NO se crea suscripción automáticamente.
      // El SUPERADMIN decide si asignar DEMO (y por cuánto tiempo) o un plan pagado.

      return { store, owner, flagsApplied: profileFlags.length };
    });

    return NextResponse.json({
      success: true,
      store: {
        ...result.store,
        businessProfile: result.store.businessProfile,
      },
      owner: {
        id: result.owner.id,
        email: result.owner.email,
        name: result.owner.name,
      },
      flagsApplied: result.flagsApplied,
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating store:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al crear tienda' },
      { status: 500 }
    );
  }
}
