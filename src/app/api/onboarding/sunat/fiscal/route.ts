/**
 * MÓDULO 18.8 — PATCH /api/onboarding/sunat/fiscal
 * 
 * Guarda los datos fiscales del emisor (RUC, razón social, dirección).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { isValidRuc } from '@/lib/sunat/validation/fiscalValidations';

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
        { error: 'Solo el propietario puede configurar SUNAT' },
        { status: 403 }
      );
    }

    // 3. Verificar tienda activa
    const store = await prisma.store.findUnique({
      where: { id: user.storeId! },
      select: { status: true },
    });

    if (!store || store.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: 'La tienda está archivada' },
        { status: 403 }
      );
    }

    // 4. Parsear body
    const body = await req.json();
    const { ruc, razonSocial, address, ubigeo } = body;

    // 5. Validaciones
    if (!ruc || !isValidRuc(ruc)) {
      return NextResponse.json(
        { error: 'RUC inválido. Debe tener 11 dígitos.' },
        { status: 400 }
      );
    }

    if (!razonSocial || razonSocial.trim().length < 3) {
      return NextResponse.json(
        { error: 'Razón social debe tener al menos 3 caracteres' },
        { status: 400 }
      );
    }

    if (!address || address.trim().length < 5) {
      return NextResponse.json(
        { error: 'Dirección debe tener al menos 5 caracteres' },
        { status: 400 }
      );
    }

    // 6. Upsert settings
    const settings = await prisma.sunatSettings.upsert({
      where: { storeId: user.storeId! },
      update: {
        ruc: ruc.trim(),
        razonSocial: razonSocial.trim(),
        address: address.trim(),
        ubigeo: ubigeo?.trim() || null,
        stepFiscalData: true,
      },
      create: {
        storeId: user.storeId!,
        env: 'BETA',
        enabled: false,
        ruc: ruc.trim(),
        razonSocial: razonSocial.trim(),
        address: address.trim(),
        ubigeo: ubigeo?.trim() || null,
        stepFiscalData: true,
      },
    });

    // 7. Audit log
    await prisma.auditLog.create({
      data: {
        storeId: user.storeId!,
        userId: user.userId,
        action: 'SUNAT_ONBOARD_FISCAL_UPDATED',
        entityType: 'SUNAT',
        entityId: settings.id,
        severity: 'INFO',
        meta: {
          ruc: ruc,
          // No loguear datos sensibles completos
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: 'Datos fiscales guardados correctamente',
    });

  } catch (error: any) {
    console.error('Error en PATCH /api/onboarding/sunat/fiscal:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
