/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.2 — /api/units/convert
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint para calcular conversiones de unidades.
 * Usado por el POS para mostrar equivalencias antes del checkout.
 * 
 * POST /api/units/convert → Calcula conversión sin guardar
 * 
 * REQUIERE: productMasterId para buscar conversión específica.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey } from '@prisma/client';
import { getSessionOrThrow } from '@/lib/session';
import { 
  requireStoreActive, 
  requireFlag, 
  guardErrorToResponse 
} from '@/lib/guards/requireFlag';
import { normalizeToBaseUnit } from '@/lib/units';

// ══════════════════════════════════════════════════════════════════════════════
// POST - Calcular conversión
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);

    const body = await request.json();
    const { quantity, saleUnitId, baseUnitId, productMasterId } = body;

    // Validaciones
    if (quantity === undefined || !saleUnitId || !baseUnitId || !productMasterId) {
      return NextResponse.json(
        { error: 'Campos requeridos: quantity, saleUnitId, baseUnitId, productMasterId' },
        { status: 400 }
      );
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return NextResponse.json(
        { error: 'La cantidad debe ser un número positivo' },
        { status: 400 }
      );
    }

    // ✅ F2.2: Calcular conversión con storeId y productMasterId
    const result = await normalizeToBaseUnit(
      quantity, 
      saleUnitId, 
      baseUnitId,
      session.storeId,  // ✅ F2.2: storeId
      productMasterId   // ✅ F2.2: productMasterId
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      original: {
        quantity,
        unitId: saleUnitId,
        sunatCode: result.sellUnitSunatCode,
      },
      converted: {
        quantity: result.quantityBase,
        unitCode: result.baseUnitCode,
        sunatCode: result.baseUnitSunatCode,
        factor: result.factor,
        roundingMode: result.roundingMode,
      },
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
