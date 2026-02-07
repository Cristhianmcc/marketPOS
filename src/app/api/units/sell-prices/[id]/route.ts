/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.3 — API DE PRECIOS POR PRESENTACIÓN (INDIVIDUAL)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * PATCH /api/units/sell-prices/[id]
 * - Actualiza precio, notas o estado activo
 * 
 * DELETE /api/units/sell-prices/[id]
 * - Elimina (hard delete) el precio override
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSessionOrThrow } from '@/lib/session';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSessionOrThrow();
    
    // Solo OWNER
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede modificar precios' },
        { status: 403 }
      );
    }
    
    // Verificar flag
    const enabled = await isFeatureEnabled(
      session.storeId,
      FeatureFlagKey.ENABLE_SELLUNIT_PRICING
    );
    
    if (!enabled) {
      return NextResponse.json(
        { error: 'SELLUNIT_PRICING_DISABLED', message: 'Precios por presentación no están habilitados' },
        { status: 403 }
      );
    }
    
    // Verificar que existe y pertenece a la tienda
    const existing = await prisma.sellUnitPrice.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json(
        { error: 'Precio no encontrado' },
        { status: 404 }
      );
    }
    
    if (existing.storeId !== session.storeId) {
      return NextResponse.json(
        { error: 'No tienes permiso para modificar este precio' },
        { status: 403 }
      );
    }
    
    const body = await req.json();
    const { price, notes, active } = body;
    
    // Validar precio si se proporciona
    if (price !== undefined && (typeof price !== 'number' || price <= 0)) {
      return NextResponse.json(
        { error: 'El precio debe ser un número mayor a 0' },
        { status: 400 }
      );
    }
    
    const updated = await prisma.sellUnitPrice.update({
      where: { id },
      data: {
        ...(price !== undefined && { price }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(active !== undefined && { active }),
      },
      include: {
        sellUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
          },
        },
      },
    });
    
    return NextResponse.json({
      id: updated.id,
      sellUnitId: updated.sellUnitId,
      sellUnit: updated.sellUnit,
      price: updated.price.toNumber(),
      notes: updated.notes,
      active: updated.active,
    });
  } catch (error: any) {
    console.error('Error updating sell unit price:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar precio' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSessionOrThrow();
    
    // Solo OWNER
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede eliminar precios' },
        { status: 403 }
      );
    }
    
    // Verificar que existe y pertenece a la tienda
    const existing = await prisma.sellUnitPrice.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json(
        { error: 'Precio no encontrado' },
        { status: 404 }
      );
    }
    
    if (existing.storeId !== session.storeId) {
      return NextResponse.json(
        { error: 'No tienes permiso para eliminar este precio' },
        { status: 403 }
      );
    }
    
    await prisma.sellUnitPrice.delete({
      where: { id },
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting sell unit price:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar precio' },
      { status: 500 }
    );
  }
}
