/**
 * MÓDULO 18.8 — PATCH /api/onboarding/sunat/preferences
 * 
 * Guarda las preferencias de emisión automática.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest) {
  try {
    // 1. Feature flag
    if (process.env.ENABLE_SUNAT !== 'true') {
      return NextResponse.json(
        { error: 'SUNAT no está habilitado' },
        { status: 403 }
      );
    }

    // 2. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede configurar preferencias' },
        { status: 403 }
      );
    }

    // 3. Parsear body
    const body = await req.json();
    const { autoEmitBoleta, allowFactura, defaultDocType } = body;

    // 4. Validaciones
    if (typeof autoEmitBoleta !== 'boolean') {
      return NextResponse.json(
        { error: 'autoEmitBoleta debe ser boolean' },
        { status: 400 }
      );
    }

    if (typeof allowFactura !== 'boolean') {
      return NextResponse.json(
        { error: 'allowFactura debe ser boolean' },
        { status: 400 }
      );
    }

    const validDocTypes = ['NONE', 'BOLETA', 'FACTURA'];
    if (!validDocTypes.includes(defaultDocType)) {
      return NextResponse.json(
        { error: 'defaultDocType debe ser NONE, BOLETA o FACTURA' },
        { status: 400 }
      );
    }

    // Si defaultDocType es FACTURA, allowFactura debe ser true
    if (defaultDocType === 'FACTURA' && !allowFactura) {
      return NextResponse.json(
        { error: 'Para usar FACTURA por defecto, debes permitir facturas' },
        { status: 400 }
      );
    }

    // 5. Actualizar settings
    const settings = await prisma.sunatSettings.update({
      where: { storeId: user.storeId! },
      data: {
        autoEmitBoleta,
        allowFactura,
        defaultDocType,
      },
    });

    // 6. Audit log
    await prisma.auditLog.create({
      data: {
        storeId: user.storeId!,
        userId: user.userId,
        action: 'SUNAT_ONBOARD_PREFERENCES_UPDATED',
        entityType: 'SUNAT',
        entityId: settings.id,
        severity: 'INFO',
        meta: {
          autoEmitBoleta,
          allowFactura,
          defaultDocType,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: 'Preferencias guardadas correctamente',
    });

  } catch (error: any) {
    console.error('Error en PATCH /api/onboarding/sunat/preferences:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
