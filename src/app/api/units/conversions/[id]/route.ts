/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.2 — /api/units/conversions/[id]
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * PATCH /api/units/conversions/:id → Actualizar conversión (factorToBase, roundingMode, active)
 * DELETE /api/units/conversions/:id → Desactivar conversión (active=false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey, Prisma, RoundingMode } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getSessionOrThrow } from '@/lib/session';
import { 
  requireStoreActive, 
  requireFlag, 
  requireRole,
  guardErrorToResponse 
} from '@/lib/guards/requireFlag';

// ══════════════════════════════════════════════════════════════════════════════
// PATCH - Actualizar conversión
// ══════════════════════════════════════════════════════════════════════════════

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);
    requireRole(session.role, ['OWNER']);

    const { id } = await params;
    const body = await request.json();
    const { factorToBase, roundingMode, active } = body;

    // Verificar que la conversión existe y pertenece a la tienda
    const conversion = await prisma.unitConversion.findFirst({
      where: {
        id,
        storeId: session.storeId,
      },
    });

    if (!conversion) {
      return NextResponse.json(
        { error: 'Conversión no encontrada' },
        { status: 404 }
      );
    }

    // Preparar datos de actualización
    const updateData: Prisma.UnitConversionUpdateInput = {};

    if (factorToBase !== undefined) {
      if (typeof factorToBase !== 'number' || factorToBase <= 0) {
        return NextResponse.json(
          { error: 'factorToBase debe ser un número positivo' },
          { status: 400 }
        );
      }
      updateData.factorToBase = new Prisma.Decimal(factorToBase);
    }

    if (roundingMode !== undefined) {
      const validRoundingModes: RoundingMode[] = ['NONE', 'ROUND', 'CEIL', 'FLOOR'];
      if (!validRoundingModes.includes(roundingMode)) {
        return NextResponse.json(
          { error: 'roundingMode inválido. Valores válidos: NONE, ROUND, CEIL, FLOOR' },
          { status: 400 }
        );
      }
      updateData.roundingMode = roundingMode;
    }

    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return NextResponse.json(
          { error: 'active debe ser booleano' },
          { status: 400 }
        );
      }
      updateData.active = active;
    }

    // Si no hay nada que actualizar
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos para actualizar' },
        { status: 400 }
      );
    }

    const updated = await prisma.unitConversion.update({
      where: { id },
      data: updateData,
      include: {
        fromUnit: { select: { id: true, sunatCode: true, displayName: true, symbol: true } },
        toUnit: { select: { id: true, sunatCode: true, displayName: true, symbol: true } },
      },
    });

    return NextResponse.json({ 
      message: 'Conversión actualizada',
      conversion: updated,
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE - Desactivar conversión (soft delete para auditoría)
// ══════════════════════════════════════════════════════════════════════════════

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);
    requireRole(session.role, ['OWNER']);

    const { id } = await params;

    // Verificar que la conversión existe y pertenece a la tienda
    const conversion = await prisma.unitConversion.findFirst({
      where: {
        id,
        storeId: session.storeId,
      },
    });

    if (!conversion) {
      return NextResponse.json(
        { error: 'Conversión no encontrada' },
        { status: 404 }
      );
    }

    // Soft delete: desactivar
    await prisma.unitConversion.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ 
      message: 'Conversión desactivada',
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
