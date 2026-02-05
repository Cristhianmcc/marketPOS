/**
 * MÓDULO 18.8 — PATCH /api/onboarding/sunat/credentials
 * 
 * Guarda las credenciales SOL (usuario y contraseña).
 * NUNCA devuelve la contraseña.
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
    const { solUser, solPass } = body;

    // 5. Validaciones
    if (!solUser || solUser.trim().length < 1) {
      return NextResponse.json(
        { error: 'Usuario SOL es requerido' },
        { status: 400 }
      );
    }

    if (!solPass || solPass.length < 1) {
      return NextResponse.json(
        { error: 'Contraseña SOL es requerida' },
        { status: 400 }
      );
    }

    // 6. Upsert settings
    const settings = await prisma.sunatSettings.upsert({
      where: { storeId: user.storeId! },
      update: {
        solUser: solUser.trim(),
        solPass: solPass, // En producción, esto debería estar cifrado
        stepSolCredentials: true,
      },
      create: {
        storeId: user.storeId!,
        env: 'BETA',
        enabled: false,
        solUser: solUser.trim(),
        solPass: solPass,
        stepSolCredentials: true,
      },
    });

    // 7. Audit log (sin secretos)
    await prisma.auditLog.create({
      data: {
        storeId: user.storeId!,
        userId: user.userId,
        action: 'SUNAT_ONBOARD_CREDENTIALS_UPDATED',
        entityType: 'SUNAT',
        entityId: settings.id,
        severity: 'INFO',
        meta: {
          solUser: solUser.trim(),
          // NUNCA loguear solPass
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: 'Credenciales SOL guardadas correctamente',
    });

  } catch (error: any) {
    console.error('Error en PATCH /api/onboarding/sunat/credentials:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
