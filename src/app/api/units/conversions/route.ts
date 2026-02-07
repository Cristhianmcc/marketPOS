/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.2 — /api/units/conversions
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * CRUD de conversiones de unidades por tienda y producto.
 * Requiere flag ENABLE_CONVERSIONS.
 * 
 * GET  /api/units/conversions?productMasterId=... → Lista conversiones activas
 * POST /api/units/conversions → Crea conversión (solo OWNER)
 * 
 * REGLA CLAVE:
 * - toUnitId SIEMPRE es ProductMaster.baseUnitId (no se acepta del cliente)
 * - Conversiones son por (tienda, producto, fromUnit, toUnit)
 * - El precio es SIEMPRE por unidad base; sellQty * factor = baseQty
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
// GET - Listar conversiones para un producto
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);

    const { searchParams } = new URL(request.url);
    const productMasterId = searchParams.get('productMasterId');

    if (!productMasterId) {
      return NextResponse.json(
        { error: 'productMasterId es requerido' },
        { status: 400 }
      );
    }

    // Verificar que el producto existe y pertenece a la tienda
    const storeProduct = await prisma.storeProduct.findFirst({
      where: {
        storeId: session.storeId,
        productId: productMasterId,
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
      return NextResponse.json(
        { error: 'Producto no encontrado en esta tienda' },
        { status: 404 }
      );
    }

    // Obtener conversiones activas para este producto en esta tienda
    const conversions = await prisma.unitConversion.findMany({
      where: {
        storeId: session.storeId,
        productMasterId,
        active: true,
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
      productName: storeProduct.product.name,
      baseUnit: storeProduct.product.baseUnit,
      conversions,
      count: conversions.length,
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST - Crear conversión
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);
    requireRole(session.role, ['OWNER']);

    const body = await request.json();
    const { productMasterId, fromUnitId, factorToBase, roundingMode } = body;

    // Validaciones básicas
    if (!productMasterId) {
      return NextResponse.json(
        { error: 'productMasterId es requerido' },
        { status: 400 }
      );
    }

    if (!fromUnitId) {
      return NextResponse.json(
        { error: 'fromUnitId es requerido' },
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

    // Verificar que el producto existe y pertenece a la tienda
    const storeProduct = await prisma.storeProduct.findFirst({
      where: {
        storeId: session.storeId,
        productId: productMasterId,
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
      return NextResponse.json(
        { error: 'Producto no encontrado en esta tienda' },
        { status: 404 }
      );
    }

    const product = storeProduct.product;

    // REGLA: El producto DEBE tener baseUnit
    if (!product.baseUnitId || !product.baseUnit) {
      return NextResponse.json(
        { error: 'El producto debe tener una unidad base configurada' },
        { status: 400 }
      );
    }

    const toUnitId = product.baseUnitId;

    // REGLA: fromUnit != toUnit
    if (fromUnitId === toUnitId) {
      return NextResponse.json(
        { error: 'La unidad de venta no puede ser igual a la unidad base' },
        { status: 400 }
      );
    }

    // Verificar que fromUnit existe y es GOODS
    const fromUnit = await prisma.unit.findUnique({ where: { id: fromUnitId } });
    if (!fromUnit) {
      return NextResponse.json(
        { error: 'Unidad de venta no encontrada' },
        { status: 404 }
      );
    }

    if (fromUnit.kind !== 'GOODS') {
      return NextResponse.json(
        { error: 'La unidad de venta debe ser tipo GOODS (bienes)' },
        { status: 400 }
      );
    }

    // Verificar que baseUnit es GOODS
    if (product.baseUnit.kind !== 'GOODS') {
      return NextResponse.json(
        { error: 'La unidad base debe ser tipo GOODS (bienes)' },
        { status: 400 }
      );
    }

    // Buscar conversión existente (unique constraint)
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

    return NextResponse.json({ 
      message: existing ? 'Conversión actualizada' : 'Conversión creada',
      conversion,
    }, { status: existing ? 200 : 201 });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
