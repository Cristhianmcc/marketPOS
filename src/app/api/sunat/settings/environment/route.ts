/**
 * MÓDULO 18.7 — POST /api/sunat/settings/environment
 * 
 * Endpoint para cambiar el entorno SUNAT (BETA ↔ PROD).
 * 
 * ⚠️ PROD LOCK — RESTRICCIONES CRÍTICAS:
 * 
 * 1. Solo SUPERADMIN puede cambiar a PROD
 * 2. Validación completa de configuración antes de permitir PROD:
 *    - RUC configurado (11 dígitos)
 *    - Credenciales SOL configuradas para la tienda
 *    - Certificado digital cargado para la tienda
 * 3. Confirmación tipada: debe enviar confirmText = "ACTIVAR PRODUCCION"
 * 4. Auditoría completa del cambio (sin datos sensibles)
 * 
 * @author Sistema Market
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/auditLog';
import { z } from 'zod';

/**
 * Confirmación requerida para activar PRODUCCIÓN
 */
const PROD_CONFIRM_TEXT = 'ACTIVAR PRODUCCION';

/**
 * Schema de validación para cambio de entorno
 */
const EnvironmentChangeSchema = z.object({
  env: z.enum(['BETA', 'PROD']),
  confirmText: z.string().optional(),
});

/**
 * Verifica si las credenciales SOL están disponibles para la tienda.
 */
function hasSolCredentials(settings: any): boolean {
  const solUser = settings?.solUser;
  const solPass = settings?.solPass;
  return !!(solUser && solPass);
}

/**
 * Verifica si el certificado está disponible para la tienda.
 */
function hasCertificate(settings: any): boolean {
  const certPfx = settings?.certPfxBase64;
  const certPass = settings?.certPassword;
  return !!(certPfx && certPass);
}

/**
 * Valida que el RUC tenga 11 dígitos
 */
function isValidRuc(ruc: string | null | undefined): boolean {
  if (!ruc) return false;
  return /^\d{11}$/.test(ruc);
}

/**
 * POST /api/sunat/settings/environment
 * 
 * Cambia el entorno SUNAT (BETA ↔ PROD).
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }
    if (!user.storeId) {
      return NextResponse.json({ error: 'Seleccione una tienda' }, { status: 400 });
    }

    // 2. Solo SUPERADMIN puede cambiar entorno
    const isSuper = await isSuperAdmin(user.email);
    if (!isSuper) {
      return NextResponse.json(
        { 
          error: 'Solo SUPERADMIN puede cambiar el entorno SUNAT',
          code: 'FORBIDDEN_NOT_SUPERADMIN',
        },
        { status: 403 }
      );
    }

    // 3. Validar body
    const body = await req.json();
    const { env, confirmText } = EnvironmentChangeSchema.parse(body);

    // 4. Obtener configuración actual
    const settings = await prisma.sunatSettings.findUnique({
      where: { storeId: user.storeId! },
    });

    if (!settings) {
      return NextResponse.json(
        { 
          error: 'No existe configuración SUNAT para esta tienda. Use POST /api/sunat/initialize primero.',
          code: 'SETTINGS_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // 5. Si ya está en el mismo entorno, no hacer nada
    if (settings.env === env) {
      return NextResponse.json({
        success: true,
        message: `El entorno ya está configurado como ${env}`,
        env: settings.env,
        changed: false,
      });
    }

    // 6. ⚠️ PROD LOCK — Validaciones adicionales para PROD
    if (env === 'PROD') {
      const validationErrors: string[] = [];

      // 6.1 Validar confirmación tipada
      if (confirmText !== PROD_CONFIRM_TEXT) {
        return NextResponse.json(
          { 
            error: 'Confirmación requerida para activar PRODUCCIÓN',
            code: 'PROD_CONFIRM_REQUIRED',
            hint: `Envíe confirmText: "${PROD_CONFIRM_TEXT}"`,
          },
          { status: 400 }
        );
      }

      // 6.2 Validar RUC
      if (!isValidRuc(settings.ruc)) {
        validationErrors.push('RUC no configurado o inválido (debe tener 11 dígitos)');
      }

      // 6.3 Validar credenciales SOL
      if (!hasSolCredentials(settings)) {
        validationErrors.push('Credenciales SOL no configuradas para esta tienda');
      }

      // 6.4 Validar certificado digital
      if (!hasCertificate(settings)) {
        validationErrors.push('Certificado digital no configurado para esta tienda');
      }

      // 6.5 Validar datos del emisor
      if (!settings.razonSocial) {
        validationErrors.push('Razón social no configurada');
      }

      // Si hay errores de validación, no permitir cambio a PROD
      if (validationErrors.length > 0) {
        // Auditar intento fallido
        await logAudit({
          storeId: user.storeId,
          userId: user.email,
          action: 'SUNAT_ENV_SWITCH_FAILED',
          entityType: 'SUNAT',
          entityId: settings.id,
          severity: 'WARN',
          meta: {
            attemptedEnv: 'PROD',
            errors: validationErrors,
          },
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
          userAgent: req.headers.get('user-agent') || null,
        });

        return NextResponse.json(
          { 
            error: 'No se puede activar PRODUCCIÓN. Complete la configuración primero.',
            code: 'PROD_REQUIREMENTS_NOT_MET',
            validationErrors,
          },
          { status: 400 }
        );
      }
    }

    // 7. Actualizar entorno
    const previousEnv = settings.env;
    
    const updatedSettings = await prisma.sunatSettings.update({
      where: { storeId: user.storeId! },
      data: { env },
    });

    // 8. Auditoría del cambio (sin datos sensibles)
    await logAudit({
      storeId: user.storeId,
      userId: user.email,
      action: 'SUNAT_ENV_SWITCHED',
      entityType: 'SUNAT',
      entityId: settings.id,
      severity: env === 'PROD' ? 'WARN' : 'INFO',
      meta: {
        previousEnv,
        newEnv: env,
        ruc: settings.ruc,
        // ⚠️ NUNCA incluir: solPass, certPassword, certPfxBase64
      },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent') || null,
    });

    // 9. Log en consola para operaciones (sin datos sensibles)
    console.log(
      `[SUNAT] 🔄 Entorno cambiado: ${previousEnv} → ${env}`,
      `| Store: ${user.storeId}`,
      `| Usuario: ${user.email}`,
      `| RUC: ${settings.ruc}`
    );

    // 10. Respuesta exitosa
    return NextResponse.json({
      success: true,
      message: env === 'PROD' 
        ? '⚠️ PRODUCCIÓN activada. Los documentos se enviarán a SUNAT real.'
        : 'Entorno cambiado a BETA (homologación).',
      env: updatedSettings.env,
      changed: true,
      previousEnv,
    });

  } catch (error: any) {
    // Error de Zod
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { 
          error: 'Datos de entrada inválidos',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('[SUNAT] Error en POST /api/sunat/settings/environment:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sunat/settings/environment
 * 
 * Devuelve el entorno actual y si se cumplen los requisitos para PROD.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }
    if (!user.storeId) {
      return NextResponse.json({ error: 'Seleccione una tienda' }, { status: 400 });
    }

    // 2. Obtener configuración
    const settings = await prisma.sunatSettings.findUnique({
      where: { storeId: user.storeId! },
    });

    if (!settings) {
      return NextResponse.json(
        { 
          error: 'No existe configuración SUNAT para esta tienda',
          code: 'SETTINGS_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // 3. Verificar requisitos para PROD
    const prodRequirements = {
      hasValidRuc: isValidRuc(settings.ruc),
      hasSolCredentials: hasSolCredentials(settings),
      hasCertificate: hasCertificate(settings),
      hasRazonSocial: !!settings.razonSocial,
    };

    const canActivateProd = 
      prodRequirements.hasValidRuc &&
      prodRequirements.hasSolCredentials &&
      prodRequirements.hasCertificate &&
      prodRequirements.hasRazonSocial;

    // 4. Verificar si es SUPERADMIN (solo ellos pueden cambiar a PROD)
    const isSuper = await isSuperAdmin(user.email);

    return NextResponse.json({
      currentEnv: settings.env,
      enabled: settings.enabled,
      prodRequirements,
      canActivateProd,
      canSwitchEnv: isSuper,
      // Para activar PROD se necesita:
      hint: !canActivateProd 
        ? 'Complete la configuración antes de activar PRODUCCIÓN'
        : 'Listo para activar PRODUCCIÓN',
    });

  } catch (error: any) {
    console.error('[SUNAT] Error en GET /api/sunat/settings/environment:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
