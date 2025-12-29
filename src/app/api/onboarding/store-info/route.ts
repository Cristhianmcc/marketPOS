// src/app/api/onboarding/store-info/route.ts
// ✅ MÓDULO 16.2: Onboarding - Actualizar información de la tienda

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { createAuditLog } from '@/domain/audit-log/audit-log-service';

/**
 * PUT /api/onboarding/store-info
 * Actualiza la información básica de la tienda durante onboarding
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    // Solo OWNER
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede actualizar información de la tienda' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, ruc, address, phone, ticketHeaderLine1, ticketHeaderLine2 } = body;

    // Validaciones
    if (!name || name.trim().length < 3) {
      return NextResponse.json(
        { error: 'El nombre de la tienda debe tener al menos 3 caracteres' },
        { status: 400 }
      );
    }

    // Actualizar Store
    const store = await prisma.store.update({
      where: { id: session.storeId },
      data: {
        name: name.trim(),
        ruc: ruc?.trim() || null,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
      },
    });

    // Actualizar StoreSettings con headers de ticket
    await prisma.storeSettings.update({
      where: { storeId: session.storeId },
      data: {
        ticketHeaderLine1: ticketHeaderLine1?.trim() || null,
        ticketHeaderLine2: ticketHeaderLine2?.trim() || null,
      },
    });

    // Auditoría
    await createAuditLog({
      storeId: session.storeId,
      userId: session.userId,
      action: 'STORE_INFO_UPDATED',
      entityType: 'STORE',
      entityId: session.storeId,
      severity: 'INFO',
      meta: {
        name: store.name,
        ruc: store.ruc,
        duringOnboarding: true,
      },
    });

    return NextResponse.json({ store });
  } catch (error: any) {
    console.error('Error updating store info:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar información de la tienda' },
      { status: 500 }
    );
  }
}
