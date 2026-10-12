/**
 * MÓDULO 18.8 — PATCH /api/onboarding/sunat/activate
 * 
 * Activa o desactiva SUNAT para la tienda.
 * Para PROD requiere confirmación typed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { FeatureFlagKey } from '@prisma/client';
import { invalidateStoreFlags } from '@/lib/featureFlags';
import { getPlanCapability } from '@/lib/planCapabilities';
import { validateProductionReadiness } from '@/lib/sunat/validation/productionReadiness';

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
      if (env === 'PROD' && !settings.stepSolCredentials) missingSteps.push('Credenciales SOL');
      if (env === 'PROD' && !settings.stepCertificate) missingSteps.push('Certificado digital');
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

    // 7. Para PROD, validar la configuración real y exigir confirmación typed.
    if (env === 'PROD' && enabled) {
      const readiness = validateProductionReadiness(settings);
      if (!readiness.ready) {
        return NextResponse.json(
          {
            error: 'No se puede activar PRODUCCIÓN. Corrige los requisitos indicados.',
            code: 'PROD_REQUIREMENTS_NOT_MET',
            validationErrors: readiness.errors,
            prodReadiness: readiness,
          },
          { status: 409 }
        );
      }

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

    // 8. Verificar que el plan contratado incluya SUNAT. Los respaldos
    // antiguos no guardaban la suscripción; el SUPERADMIN debe asignarles un
    // plan explícitamente antes de reactivar la emisión fiscal.
    const subscription = enabled
      ? await prisma.subscription.findUnique({
          where: { storeId: user.storeId! },
          select: { planCode: true },
        })
      : null;

    if (enabled && (!subscription || !getPlanCapability(subscription.planCode, 'ENABLE_SUNAT'))) {
      return NextResponse.json(
        {
          error: subscription
            ? 'El plan actual no incluye facturación electrónica SUNAT'
            : 'La tienda no tiene un plan asignado. Solicita al SUPERADMIN asignar DEMO o EMPRESARIAL.',
          code: subscription ? 'SUNAT_PLAN_REQUIRED' : 'SUBSCRIPTION_REQUIRED',
        },
        { status: 403 }
      );
    }

    // 9. Actualizar settings y reparar el flag únicamente si el plan lo permite.
    const previousEnv = settings.env;
    const previousEnabled = settings.enabled;

    await prisma.$transaction(async (tx) => {
      await tx.sunatSettings.update({
        where: { id: settings.id },
        data: {
          enabled,
          env,
        },
      });

      if (enabled) {
        await tx.featureFlag.upsert({
          where: {
            storeId_key: {
              storeId: user.storeId!,
              key: FeatureFlagKey.ENABLE_SUNAT,
            },
          },
          create: {
            storeId: user.storeId!,
            key: FeatureFlagKey.ENABLE_SUNAT,
            enabled: true,
          },
          update: { enabled: true },
        });
      }
    });

    if (enabled) invalidateStoreFlags(user.storeId!);

    // 10. Audit log
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
