// src/app/api/sunat/initialize/route.ts
// ✅ MÓDULO 18.1: Endpoint para inicializar configuración SUNAT (SOLO SUPERADMIN)

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { initializeSunatSettings, auditSunatSettingsUpdated } from '@/domain/sunat';
import { prisma } from '@/infra/db/prisma';
import { z } from 'zod';

/**
 * POST /api/sunat/initialize
 * 
 * Inicializa configuración SUNAT para una tienda (si no existe)
 * 
 * Auth: SUPERADMIN only
 */

const InitializeSchema = z.object({
  storeId: z.string().cuid(),
  env: z.enum(['BETA', 'PROD']).default('BETA'),
});

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

    // 2. Solo SUPERADMIN
    const isSuper = await isSuperAdmin(user.email);
    if (!isSuper) {
      return NextResponse.json(
        { error: 'Solo SUPERADMIN puede inicializar configuración SUNAT' },
        { status: 403 }
      );
    }

    // 3. Validar body
    const body = await req.json();
    const input = InitializeSchema.parse(body);

    // 4. Verificar que existe la tienda
    const store = await prisma.store.findUnique({
      where: { id: input.storeId },
    });

    if (!store) {
      return NextResponse.json(
        { error: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    // 5. Inicializar (upsert)
    const settings = await initializeSunatSettings(
      prisma,
      input.storeId,
      input.env
    );

    // 6. Auditoría (sin datos sensibles)
    await auditSunatSettingsUpdated({
      storeId: input.storeId,
      userId: user.email,
      action: 'CREATED',
      changes: {
        enabled: settings.enabled,
        env: settings.env,
        series: [
          settings.defaultFacturaSeries,
          settings.defaultBoletaSeries,
          settings.defaultNcSeries,
          settings.defaultNdSeries,
        ],
      },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    // 7. Retornar resultado
    return NextResponse.json({
      success: true,
      settings: {
        storeId: settings.storeId,
        env: settings.env,
        enabled: settings.enabled,
        series: {
          factura: settings.defaultFacturaSeries,
          boleta: settings.defaultBoletaSeries,
          nc: settings.defaultNcSeries,
          nd: settings.defaultNdSeries,
        },
        correlativos: {
          nextFacturaNumber: settings.nextFacturaNumber,
          nextBoletaNumber: settings.nextBoletaNumber,
          nextNcNumber: settings.nextNcNumber,
          nextNdNumber: settings.nextNdNumber,
        },
        createdAt: settings.createdAt,
      },
    });

  } catch (error) {
    console.error('[SUNAT Initialize] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Error al inicializar SUNAT',
      },
      { status: 500 }
    );
  }
}
