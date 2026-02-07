/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F1 — API DE UNIDADES PARA POS
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint optimizado para el POS que devuelve unidades y conversiones
 * disponibles para un producto específico.
 * 
 * GET /api/pos/units?productMasterId=xxx
 * 
 * Respuesta:
 * {
 *   baseUnit: { id, code, name, symbol, isBase },
 *   availableUnits: [{ id, code, name, symbol, factor }],
 *   allowsDecimals: boolean
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';
import { isDecimalUnit } from '@/lib/ferreteria';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Verificar flags
    const advancedUnitsEnabled = await isFeatureEnabled(
      session.storeId,
      FeatureFlagKey.ENABLE_ADVANCED_UNITS
    );

    if (!advancedUnitsEnabled) {
      return NextResponse.json({
        enabled: false,
        baseUnit: null,
        availableUnits: [],
        allowsDecimals: false,
      });
    }

    const { searchParams } = new URL(req.url);
    const productMasterId = searchParams.get('productMasterId');

    if (!productMasterId) {
      return NextResponse.json(
        { error: 'productMasterId es requerido' },
        { status: 400 }
      );
    }

    // Obtener producto con unidad base
    const product = await prisma.productMaster.findUnique({
      where: { id: productMasterId },
      select: {
        id: true,
        name: true,
        unitType: true,
        baseUnitId: true,
        baseUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
            sunatCode: true,
            isBase: true,
            allowDecimals: true, // ✅ MÓDULO B-SUNAT-UNITS
            precision: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    // Si no tiene unidad base configurada, usar unitType como fallback
    let baseUnit = product.baseUnit;
    let allowsDecimals = false;
    let precision = 0;

    if (!baseUnit) {
      // Buscar unidad por código unitType o sunatCode equivalente
      const fallbackUnit = await prisma.unit.findFirst({
        where: {
          OR: [
            { code: product.unitType },
            { sunatCode: product.unitType === 'UNIT' ? 'NIU' : 'KGM' }, // ✅ Fallback SUNAT
          ],
        },
      });

      if (fallbackUnit) {
        baseUnit = {
          id: fallbackUnit.id,
          code: fallbackUnit.code,
          name: fallbackUnit.name,
          symbol: fallbackUnit.symbol || fallbackUnit.code,
          sunatCode: fallbackUnit.sunatCode,
          isBase: fallbackUnit.isBase,
          allowDecimals: fallbackUnit.allowDecimals, // ✅ MÓDULO B-SUNAT-UNITS
          precision: fallbackUnit.precision,
        };
        allowsDecimals = fallbackUnit.allowDecimals;
        precision = fallbackUnit.precision;
      } else {
        // Crear respuesta mínima si no hay unidad (fallback legacy)
        allowsDecimals = product.unitType === 'KG';
        return NextResponse.json({
          enabled: true,
          baseUnit: {
            id: 'default',
            code: product.unitType,
            name: product.unitType === 'UNIT' ? 'Unidad' : 'Kilogramo',
            symbol: product.unitType === 'UNIT' ? 'UND' : 'kg',
            sunatCode: product.unitType === 'UNIT' ? 'NIU' : 'KGM',
            isBase: true,
            allowDecimals: allowsDecimals,
            precision: allowsDecimals ? 3 : 0,
          },
          availableUnits: [],
          allowsDecimals,
          precision: allowsDecimals ? 3 : 0,
        });
      }
    } else {
      // ✅ MÓDULO B-SUNAT-UNITS: Usar allowDecimals de la unidad
      allowsDecimals = baseUnit.allowDecimals ?? isDecimalUnit(baseUnit.code);
      precision = baseUnit.precision ?? (allowsDecimals ? 3 : 0);
    }

    // Verificar si conversiones están habilitadas
    const conversionsEnabled = await isFeatureEnabled(
      session.storeId,
      FeatureFlagKey.ENABLE_CONVERSIONS
    );

    let availableUnits: Array<{
      id: string;
      code: string;
      name: string;
      symbol: string;
      factor: number;
      allowsDecimals: boolean;
    }> = [];

    if (conversionsEnabled && baseUnit) {
      // ✅ MÓDULO F2.2: Obtener conversiones por (storeId, productMasterId)
      const conversions = await prisma.unitConversion.findMany({
        where: {
          storeId: session.storeId,
          productMasterId: productMasterId,
          toUnitId: baseUnit.id, // Conversiones hacia la unidad base
          active: true,
        },
        include: {
          fromUnit: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true,
              sunatCode: true,
              allowDecimals: true,
              precision: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Mapear conversiones a unidades disponibles
      for (const conv of conversions) {
        availableUnits.push({
          id: conv.fromUnit.id,
          code: conv.fromUnit.code,
          name: conv.fromUnit.name,
          symbol: conv.fromUnit.symbol || conv.fromUnit.code,
          factor: conv.factorToBase.toNumber(), // ✅ F2.2: Usa factorToBase
          // ✅ MÓDULO B-SUNAT-UNITS: Usar allowDecimals de Unit
          allowsDecimals: conv.fromUnit.allowDecimals ?? isDecimalUnit(conv.fromUnit.code),
        });
      }
    }

    return NextResponse.json({
      enabled: true,
      baseUnit,
      availableUnits,
      allowsDecimals,
      precision, // ✅ MÓDULO B-SUNAT-UNITS: Decimales permitidos
    });
  } catch (error) {
    console.error('Error fetching POS units:', error);
    return NextResponse.json(
      { error: 'Error al obtener unidades' },
      { status: 500 }
    );
  }
}
