/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2 — /api/units/products/[id]/base-unit
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Gestión de la unidad base de un producto.
 * Requiere flag ENABLE_ADVANCED_UNITS.
 * 
 * GET  → Obtiene la unidad base del producto
 * PUT  → Actualiza la unidad base del producto
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey } from '@prisma/client';
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
// GET - Obtener unidad base del producto
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: productId } = await params;
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_ADVANCED_UNITS);

    // Verificar que el producto está en la tienda
    const storeProduct = await prisma.storeProduct.findFirst({
      where: {
        product: { id: productId },
        storeId: session.storeId,
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
        { error: 'Producto no encontrado en tu tienda' },
        { status: 404 }
      );
    }

    const product = storeProduct.product;

    // Si tiene baseUnit asignado, devolverlo
    if (product.baseUnit) {
      return NextResponse.json({
        productId,
        baseUnit: product.baseUnit,
        legacyUnitType: product.unitType,
      });
    }

    // Si no, buscar por unitType legado
    const legacyUnit = await prisma.unit.findUnique({
      where: { code: product.unitType },
    });

    return NextResponse.json({
      productId,
      baseUnit: legacyUnit || {
        id: 'legacy',
        code: product.unitType,
        name: product.unitType === 'UNIT' ? 'Unidad' : 'Kilogramo',
        symbol: product.unitType === 'UNIT' ? 'und' : 'kg',
        isBase: true,
      },
      legacyUnitType: product.unitType,
      usingLegacy: !product.baseUnitId,
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PUT - Actualizar unidad base del producto
// ══════════════════════════════════════════════════════════════════════════════

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: productId } = await params;
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_ADVANCED_UNITS);
    requireRole(session.role, ['OWNER']);

    // Verificar que el producto está en la tienda
    const storeProduct = await prisma.storeProduct.findFirst({
      where: {
        product: { id: productId },
        storeId: session.storeId,
      },
    });

    if (!storeProduct) {
      return NextResponse.json(
        { error: 'Producto no encontrado en tu tienda' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { baseUnitId } = body;

    if (!baseUnitId) {
      return NextResponse.json(
        { error: 'Campo requerido: baseUnitId' },
        { status: 400 }
      );
    }

    // Verificar que la unidad existe
    const unit = await prisma.unit.findUnique({
      where: { id: baseUnitId },
    });

    if (!unit) {
      return NextResponse.json(
        { error: 'La unidad no existe' },
        { status: 404 }
      );
    }

    // Actualizar producto
    const updatedProduct = await prisma.productMaster.update({
      where: { id: productId },
      data: {
        baseUnitId,
        // También actualizar unitType legado si es UNIT o KG para compatibilidad
        unitType: unit.code === 'UNIT' ? 'UNIT' : unit.code === 'KG' ? 'KG' : undefined,
      },
      include: {
        baseUnit: true,
      },
    });

    return NextResponse.json({
      productId,
      baseUnit: updatedProduct.baseUnit,
      unitType: updatedProduct.unitType,
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
