/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V1 — POST /api/admin/stores/[id]/set-profile
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Cambia el perfil de negocio de una tienda.
 * Solo SUPERADMIN puede cambiar perfiles.
 * 
 * REGLAS:
 * - Aplica preset de flags del nuevo perfil (merge)
 * - NO apaga flags core automáticamente
 * - NO borra datos existentes
 * - Respeta limitaciones de licencia
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { BusinessProfile, FeatureFlagKey } from '@prisma/client';
import { getProfileFlags, CORE_FLAGS } from '@/lib/businessProfiles';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    const { id: storeId } = await context.params;

    // 1. Verificar autenticación
    if (!session?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // 2. Solo SUPERADMIN puede cambiar perfiles
    if (!isSuperAdmin(session.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo SUPERADMIN puede cambiar perfiles' },
        { status: 403 }
      );
    }

    // 3. Parsear body
    const body = await request.json();
    const { businessProfile } = body;

    if (!businessProfile) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'businessProfile es requerido' },
        { status: 400 }
      );
    }

    // 4. Validar que el perfil existe
    const validProfiles = Object.values(BusinessProfile);
    if (!validProfiles.includes(businessProfile)) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: `Perfil inválido: ${businessProfile}` },
        { status: 400 }
      );
    }

    // 5. Verificar que la tienda existe
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, businessProfile: true },
    });

    if (!store) {
      return NextResponse.json(
        { code: 'NOT_FOUND', message: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    const oldProfile = store.businessProfile;
    const newProfile = businessProfile as BusinessProfile;

    // 6. Obtener flags del nuevo perfil
    const newProfileFlags = getProfileFlags(newProfile);

    // 7. Aplicar cambios en transacción
    const result = await prisma.$transaction(async (tx) => {
      // Actualizar perfil de la tienda
      const updatedStore = await tx.store.update({
        where: { id: storeId },
        data: { businessProfile: newProfile },
      });

      // Aplicar preset de flags (upsert)
      // POLÍTICA: Solo activamos flags del nuevo perfil, no desactivamos los existentes
      const flagUpserts = newProfileFlags.map(flagKey => 
        tx.featureFlag.upsert({
          where: {
            storeId_key: {
              storeId,
              key: flagKey,
            },
          },
          create: {
            storeId,
            key: flagKey,
            enabled: true,
          },
          update: {
            enabled: true,
          },
        })
      );

      await Promise.all(flagUpserts);

      // Obtener todos los flags actualizados
      const currentFlags = await tx.featureFlag.findMany({
        where: { storeId },
        select: { key: true, enabled: true },
      });

      return {
        store: updatedStore,
        flags: currentFlags,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Perfil cambiado de ${oldProfile} a ${newProfile}`,
      store: {
        id: result.store.id,
        name: result.store.name,
        businessProfile: result.store.businessProfile,
      },
      flags: result.flags,
      note: 'Los datos existentes no fueron modificados. Solo se actualizaron los flags.',
    });

  } catch (error) {
    console.error('[SetProfile] Error:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al cambiar perfil' },
      { status: 500 }
    );
  }
}
