// app/api/settings/route.ts
// OWNER: Obtener y actualizar configuración de la tienda

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';

// GET /api/settings - Obtener configuración (OWNER)
export async function GET(request: NextRequest) {
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

    // Obtener Store y Settings
    const store = await prisma.store.findUnique({
      where: { id: session.user.storeId },
      include: { settings: true },
    });

    if (!store) {
      return NextResponse.json(
        { code: 'NOT_FOUND', message: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        ruc: store.ruc,
        address: store.address,
        phone: store.phone,
      },
      settings: store.settings || null,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

// PATCH /api/settings - Actualizar configuración (OWNER)
export async function PATCH(request: NextRequest) {
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
    const { storeName, storeRuc, storeAddress, storePhone, ticketFooter, taxRate } = body;

    // Actualizar Store y Settings en transacción
    const result = await prisma.$transaction(async (tx) => {
      // 1. Actualizar Store
      const updatedStore = await tx.store.update({
        where: { id: session.user.storeId },
        data: {
          name: storeName,
          ruc: storeRuc || null,
          address: storeAddress || null,
          phone: storePhone || null,
        },
      });

      // 2. Actualizar o crear Settings
      const existingSettings = await tx.storeSettings.findUnique({
        where: { storeId: session.user.storeId },
      });

      let updatedSettings;
      if (existingSettings) {
        updatedSettings = await tx.storeSettings.update({
          where: { storeId: session.user.storeId },
          data: {
            ticketFooter: ticketFooter || null,
            taxRate: taxRate !== undefined ? taxRate : 0,
          },
        });
      } else {
        updatedSettings = await tx.storeSettings.create({
          data: {
            storeId: session.user.storeId,
            ticketFooter: ticketFooter || null,
            taxRate: taxRate !== undefined ? taxRate : 0,
          },
        });
      }

      return { store: updatedStore, settings: updatedSettings };
    });

    return NextResponse.json({
      success: true,
      store: result.store,
      settings: result.settings,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al actualizar configuración' },
      { status: 500 }
    );
  }
}
