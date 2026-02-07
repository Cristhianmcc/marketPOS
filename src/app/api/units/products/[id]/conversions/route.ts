/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.2 — /api/units/products/[id]/conversions
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Gestión de conversiones específicas de un producto.
 * Requiere flag ENABLE_CONVERSIONS.
 * 
 * GET    → Lista conversiones del producto
 * POST   → Crea conversión específica del producto
 * PATCH  → Actualiza conversión (factor, roundingMode, active)
 * DELETE → Desactiva conversión (soft delete)
 * 
 * NOTA: Este endpoint es una alternativa a /api/units/conversions que
 * opera directamente en el contexto de un producto específico.
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Verificar que el producto existe y pertenece a la tienda
// ══════════════════════════════════════════════════════════════════════════════

async function verifyProductAccess(productMasterId: string, storeId: string) {
  // Buscar si el producto está en la tienda
  const storeProduct = await prisma.storeProduct.findFirst({
    where: {
      product: { id: productMasterId },
      storeId,
    },
    include: {
      product: {
        include: {
          baseUnit: true,
        },
      },
    },
  });

  if (!storeProduct) {
    return null;
  }

  return storeProduct.product;
}

// ══════════════════════════════════════════════════════════════════════════════
// GET - Listar conversiones del producto
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: productMasterId } = await params;
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);

    const product = await verifyProductAccess(productMasterId, session.storeId);
    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado en tu tienda' },
        { status: 404 }
      );
    }

    // ✅ F2.2: Obtener conversiones por (storeId, productMasterId)
    const conversions = await prisma.unitConversion.findMany({
      where: { 
        storeId: session.storeId,
        productMasterId,
      },
      include: {
        fromUnit: {
          select: { id: true, sunatCode: true, displayName: true, symbol: true, allowDecimals: true },
        },
        toUnit: {
          select: { id: true, sunatCode: true, displayName: true, symbol: true, allowDecimals: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      productMasterId,
      productName: product.name,
      baseUnit: product.baseUnit,
      conversions,
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST - Crear conversión específica del producto
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: productMasterId } = await params;
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);
    requireRole(session.role, ['OWNER']);

    const product = await verifyProductAccess(productMasterId, session.storeId);
    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado en tu tienda' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { fromUnitId, factorToBase, roundingMode } = body;

    // Validaciones
    if (!fromUnitId || factorToBase === undefined || factorToBase === null) {
      return NextResponse.json(
        { error: 'Campos requeridos: fromUnitId, factorToBase' },
        { status: 400 }
      );
    }

    if (typeof factorToBase !== 'number' || factorToBase <= 0) {
      return NextResponse.json(
        { error: 'factorToBase debe ser un número positivo' },
        { status: 400 }
      );
    }

    // Validar roundingMode si se proporciona
    const validRoundingModes: RoundingMode[] = ['NONE', 'ROUND', 'CEIL', 'FLOOR'];
    const finalRoundingMode: RoundingMode = roundingMode && validRoundingModes.includes(roundingMode) 
      ? roundingMode 
      : 'NONE';

    // ✅ F2.2: El producto DEBE tener baseUnit
    if (!product.baseUnitId || !product.baseUnit) {
      return NextResponse.json(
        { error: 'El producto debe tener una unidad base configurada' },
        { status: 400 }
      );
    }

    const toUnitId = product.baseUnitId;

    // Validar que fromUnit != toUnit
    if (fromUnitId === toUnitId) {
      return NextResponse.json(
        { error: 'La unidad de venta no puede ser igual a la unidad base' },
        { status: 400 }
      );
    }

    // Verificar que fromUnit existe y es GOODS
    const fromUnit = await prisma.unit.findUnique({
      where: { id: fromUnitId },
    });

    if (!fromUnit) {
      return NextResponse.json(
        { error: 'Unidad de venta no encontrada' },
        { status: 404 }
      );
    }

    if (fromUnit.kind !== 'GOODS') {
      return NextResponse.json(
        { error: 'La unidad de venta debe ser tipo GOODS' },
        { status: 400 }
      );
    }

    // ✅ F2.2: Buscar conversión existente por unique constraint
    const existing = await prisma.unitConversion.findUnique({
      where: {
        storeId_productMasterId_fromUnitId_toUnitId: {
          storeId: session.storeId,
          productMasterId,
          fromUnitId,
          toUnitId,
        },
      },
    });

    let conversion;
    if (existing) {
      // Actualizar existente
      conversion = await prisma.unitConversion.update({
        where: { id: existing.id },
        data: { 
          factorToBase: new Prisma.Decimal(factorToBase),
          roundingMode: finalRoundingMode,
          active: true,
        },
        include: {
          fromUnit: { select: { id: true, sunatCode: true, displayName: true, symbol: true } },
          toUnit: { select: { id: true, sunatCode: true, displayName: true, symbol: true } },
        },
      });
    } else {
      // Crear nueva
      conversion = await prisma.unitConversion.create({
        data: {
          storeId: session.storeId,
          productMasterId,
          fromUnitId,
          toUnitId,
          factorToBase: new Prisma.Decimal(factorToBase),
          roundingMode: finalRoundingMode,
        },
        include: {
          fromUnit: { select: { id: true, sunatCode: true, displayName: true, symbol: true } },
          toUnit: { select: { id: true, sunatCode: true, displayName: true, symbol: true } },
        },
      });
    }

    return NextResponse.json(conversion, { status: existing ? 200 : 201 });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PATCH - Actualizar conversión
// ══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: productMasterId } = await params;
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);
    requireRole(session.role, ['OWNER']);

    const product = await verifyProductAccess(productMasterId, session.storeId);
    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado en tu tienda' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { conversionId, active, factorToBase, roundingMode } = body;

    if (!conversionId) {
      return NextResponse.json(
        { error: 'conversionId es requerido' },
        { status: 400 }
      );
    }

    // ✅ F2.2: Verificar que la conversión existe y pertenece al producto en esta tienda
    const conversion = await prisma.unitConversion.findFirst({
      where: {
        id: conversionId,
        storeId: session.storeId,
        productMasterId,
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

    if (typeof active === 'boolean') {
      updateData.active = active;
    }

    if (typeof factorToBase === 'number' && factorToBase > 0) {
      updateData.factorToBase = new Prisma.Decimal(factorToBase);
    }

    const validRoundingModes: RoundingMode[] = ['NONE', 'ROUND', 'CEIL', 'FLOOR'];
    if (roundingMode && validRoundingModes.includes(roundingMode)) {
      updateData.roundingMode = roundingMode;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'Sin campos para actualizar' },
        { status: 400 }
      );
    }

    const updated = await prisma.unitConversion.update({
      where: { id: conversionId },
      data: updateData,
      include: {
        fromUnit: { select: { id: true, sunatCode: true, displayName: true, symbol: true } },
        toUnit: { select: { id: true, sunatCode: true, displayName: true, symbol: true } },
      },
    });

    return NextResponse.json(updated);

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE - Desactivar conversión (soft delete)
// ══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: productMasterId } = await params;
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);
    requireRole(session.role, ['OWNER']);

    const product = await verifyProductAccess(productMasterId, session.storeId);
    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado en tu tienda' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const conversionId = searchParams.get('conversionId');

    if (!conversionId) {
      return NextResponse.json(
        { error: 'Parámetro requerido: conversionId' },
        { status: 400 }
      );
    }

    // ✅ F2.2: Verificar que la conversión existe y pertenece al producto
    const conversion = await prisma.unitConversion.findFirst({
      where: {
        id: conversionId,
        storeId: session.storeId,
        productMasterId,
      },
    });

    if (!conversion) {
      return NextResponse.json(
        { error: 'Conversión no encontrada' },
        { status: 404 }
      );
    }

    // Soft delete: desactivar en lugar de eliminar
    await prisma.unitConversion.update({
      where: { id: conversionId },
      data: { active: false },
    });

    return NextResponse.json({ success: true, message: 'Conversión desactivada' });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
