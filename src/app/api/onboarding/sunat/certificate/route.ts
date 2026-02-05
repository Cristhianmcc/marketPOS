/**
 * MÓDULO 18.8 — PATCH /api/onboarding/sunat/certificate
 * 
 * Guarda el certificado digital PFX (Base64) y su contraseña.
 * NUNCA devuelve el certificado ni la contraseña.
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
    const { certPfxBase64, certPassword } = body;

    // 5. Validaciones
    if (!certPfxBase64 || certPfxBase64.length < 100) {
      return NextResponse.json(
        { error: 'Certificado PFX inválido' },
        { status: 400 }
      );
    }

    if (!certPassword || certPassword.length < 1) {
      return NextResponse.json(
        { error: 'Contraseña del certificado es requerida' },
        { status: 400 }
      );
    }

    // 6. Validar que es Base64 válido
    try {
      const buffer = Buffer.from(certPfxBase64, 'base64');
      if (buffer.length < 100) {
        throw new Error('Certificado muy pequeño');
      }
    } catch {
      return NextResponse.json(
        { error: 'El certificado no es un Base64 válido' },
        { status: 400 }
      );
    }

    // 7. Upsert settings
    const settings = await prisma.sunatSettings.upsert({
      where: { storeId: user.storeId! },
      update: {
        certPfxBase64: certPfxBase64,
        certPassword: certPassword,
        stepCertificate: true,
        // Resetear test de firma si cambia el certificado
        stepTestSign: false,
      },
      create: {
        storeId: user.storeId!,
        env: 'BETA',
        enabled: false,
        certPfxBase64: certPfxBase64,
        certPassword: certPassword,
        stepCertificate: true,
      },
    });

    // 8. Audit log (sin secretos)
    await prisma.auditLog.create({
      data: {
        storeId: user.storeId!,
        userId: user.userId,
        action: 'SUNAT_ONBOARD_CERT_UPDATED',
        entityType: 'SUNAT',
        entityId: settings.id,
        severity: 'INFO',
        meta: {
          certSize: certPfxBase64.length,
          // NUNCA loguear certPfxBase64 ni certPassword
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: 'Certificado guardado correctamente',
    });

  } catch (error: any) {
    console.error('Error en PATCH /api/onboarding/sunat/certificate:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
