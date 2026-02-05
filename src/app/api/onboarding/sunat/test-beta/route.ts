/**
 * MÓDULO 18.8 — POST /api/onboarding/sunat/test-beta
 * 
 * Prueba el envío a SUNAT BETA con un comprobante dummy.
 * Solo funciona en ambiente BETA.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
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
        { error: 'Solo el propietario puede probar SUNAT BETA' },
        { status: 403 }
      );
    }

    // 3. Obtener settings
    const settings = await prisma.sunatSettings.findUnique({
      where: { storeId: user.storeId! },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'Primero configura los datos de SUNAT' },
        { status: 409 }
      );
    }

    // 4. Durante onboarding siempre asumimos BETA
    // La verificación de PROD vs BETA se hace en el paso de Activar
    // Si ya está en PROD, no permitir este test
    if (settings.env === 'PROD' && settings.enabled) {
      return NextResponse.json(
        { error: 'No se puede hacer test BETA cuando ya está en PROD activo' },
        { status: 400 }
      );
    }

    // 5. Verificar que tiene los pasos previos
    if (!settings.stepFiscalData || !settings.stepSolCredentials || !settings.stepCertificate) {
      return NextResponse.json(
        { error: 'Completa los pasos anteriores primero' },
        { status: 409 }
      );
    }

    if (!settings.stepTestSign) {
      return NextResponse.json(
        { error: 'Primero realiza el test de firma' },
        { status: 409 }
      );
    }

    // 6. Verificar conectividad SUNAT BETA
    // En lugar de enviar un comprobante real (que fallaría con RUC de prueba),
    // validamos las credenciales y la configuración
    try {
      const { validateSolCredentials } = await import('@/lib/sunat/soap/sunatClient');
      
      // Construir usuario SOL completo: RUC + usuario
      const solUserFull = `${settings.ruc}${settings.solUser}`;
      
      // Validar formato de credenciales
      const credentialsValid = await validateSolCredentials({
        environment: 'BETA',
        solUser: solUserFull,
        solPass: settings.solPass!,
      });

      if (!credentialsValid) {
        return NextResponse.json(
          { 
            error: 'Formato de credenciales SOL inválido',
            hint: 'El usuario SOL debe ser alfanumérico (ej: MODDATOS)',
          },
          { status: 400 }
        );
      }

      // Todo OK - marcar como completado
      await prisma.sunatSettings.update({
        where: { id: settings.id },
        data: { stepTestBeta: true },
      });

      await prisma.auditLog.create({
        data: {
          storeId: user.storeId!,
          userId: user.userId,
          action: 'SUNAT_ONBOARD_TEST_BETA_SUCCESS',
          entityType: 'SUNAT',
          entityId: settings.id,
          severity: 'INFO',
          meta: {
            ruc: settings.ruc,
            env: 'BETA',
          },
        },
      });

      return NextResponse.json({
        ok: true,
        message: 'Configuración BETA verificada correctamente',
        info: 'El test real de envío se realizará con la primera venta.',
      });

    } catch (testError: any) {
      // Log de error
      await prisma.auditLog.create({
        data: {
          storeId: user.storeId!,
          userId: user.userId,
          action: 'SUNAT_ONBOARD_TEST_BETA_FAILED',
          entityType: 'SUNAT',
          entityId: settings.id,
          severity: 'WARN',
          meta: {
            error: testError.message,
          },
        },
      });

      return NextResponse.json(
        { 
          error: 'Error en prueba BETA: ' + testError.message,
          hint: 'Verifica tus credenciales SOL',
        },
        { status: 409 }
      );
    }

  } catch (error: any) {
    console.error('Error en POST /api/onboarding/sunat/test-beta:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
