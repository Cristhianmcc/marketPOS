/**
 * MÓDULO 18.8 — PATCH /api/onboarding/sunat/activate
 * 
 * Activa o desactiva SUNAT para la tienda.
 * Para PROD requiere confirmación typed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/superadmin';

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
        { error: 'Solo el propietario puede activar SUNAT' },
        { status: 403 }
      );
    }

    // 3. Parsear body
    const body = await req.json();
    const { enabled, env, confirmText } = body;

    // 4. Validaciones básicas
    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled debe ser boolean' },
        { status: 400 }
      );
    }

    if (env !== 'BETA' && env !== 'PROD') {
      return NextResponse.json(
        { error: 'env debe ser BETA o PROD' },
        { status: 400 }
      );
    }

    // 5. Obtener settings
    const settings = await prisma.sunatSettings.findUnique({
      where: { storeId: user.storeId! },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'Primero configura los datos de SUNAT' },
        { status: 409 }
      );
    }

    // 6. Si está activando, verificar pasos completados
    if (enabled) {
      const missingSteps = [];
      
      if (!settings.stepFiscalData) missingSteps.push('Datos fiscales');
      if (!settings.stepSolCredentials) missingSteps.push('Credenciales SOL');
      if (!settings.stepCertificate) missingSteps.push('Certificado digital');
      if (!settings.stepTestSign) missingSteps.push('Test de firma');
      
      // stepTestBeta no es requerido - la primera venta será el test real

      if (missingSteps.length > 0) {
        return NextResponse.json(
          { 
            error: 'Faltan pasos por completar',
            missingSteps,
          },
          { status: 409 }
        );
      }
    }

    // 7. Para PROD, requiere confirmación typed
    if (env === 'PROD' && enabled) {
      // Verificar si es SUPERADMIN o tiene permiso especial
      const superAdmin = isSuperAdmin(user.email);
      
      if (!superAdmin) {
        // OWNER normal necesita confirmación typed
        if (confirmText !== 'ACTIVAR PRODUCCION') {
          return NextResponse.json(
            { 
              error: 'Para activar PRODUCCIÓN, escribe "ACTIVAR PRODUCCION" para confirmar',
              code: 'PROD_CONFIRM_REQUIRED',
            },
            { status: 400 }
          );
        }
      }
    }

    // 8. Actualizar settings
    const previousEnv = settings.env;
    const previousEnabled = settings.enabled;

    await prisma.sunatSettings.update({
      where: { id: settings.id },
      data: {
        enabled,
        env,
      },
    });

    // 9. Audit log
    await prisma.auditLog.create({
      data: {
        storeId: user.storeId!,
        userId: user.userId,
        action: enabled ? 'SUNAT_ONBOARD_ACTIVATED' : 'SUNAT_ONBOARD_DEACTIVATED',
        entityType: 'SUNAT',
        entityId: settings.id,
        severity: env === 'PROD' ? 'WARN' : 'INFO',
        meta: {
          previousEnv,
          previousEnabled,
          newEnv: env,
          newEnabled: enabled,
        },
      },
    });

    // Si cambió a PROD, log adicional
    if (env === 'PROD' && previousEnv === 'BETA') {
      await prisma.auditLog.create({
        data: {
          storeId: user.storeId!,
          userId: user.userId,
          action: 'SUNAT_ENV_SWITCHED_TO_PROD',
          entityType: 'SUNAT',
          entityId: settings.id,
          severity: 'WARN',
          meta: {
            previousEnv: 'BETA',
            newEnv: 'PROD',
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: enabled 
        ? `SUNAT activado en modo ${env}` 
        : 'SUNAT desactivado',
      enabled,
      env,
    });

  } catch (error: any) {
    console.error('Error en PATCH /api/onboarding/sunat/activate:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
