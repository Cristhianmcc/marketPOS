/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO B-SUNAT-UNITS — /api/units (UNIDADES SUNAT)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * GET  /api/units → Lista unidades según perfil de tienda
 *   - Bodega: unidades comunes + topUnits bodega
 *   - Ferretería: todas las unidades SUNAT + topUnits ferretería
 *   - Con flag ENABLE_ADVANCED_UNITS: todas las unidades
 * 
 * POST /api/units → Crea unidad personalizada (requiere flag)
 * 
 * Query params GET:
 *   - kind: "GOODS" | "SERVICES" (filtrar por tipo)
 *   - profile: "BODEGA" | "FERRETERIA" (para ordenar topUnits)
 *   - all: "true" (mostrar todas sin filtrar por perfil)
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey, UnitKind } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getSessionOrThrow, getCurrentUser } from '@/lib/session';
import { 
  requireStoreActive, 
  requireFlag, 
  requireRole,
  guardErrorToResponse 
} from '@/lib/guards/requireFlag';
import { SUNAT_UNITS_DATA } from '@/lib/sunat-units-data';

// Helper: Seed unidades si no existen
async function ensureUnitsExist() {
  const count = await prisma.unit.count();
  if (count === 0) {
    console.log('[units] No units found, seeding SUNAT units...');
    await prisma.unit.createMany({
      data: SUNAT_UNITS_DATA.map(unit => ({
        code: unit.code,
        sunatCode: unit.sunatCode,
        name: unit.name,
        displayName: unit.displayName,
        symbol: unit.symbol,
        kind: unit.kind,
        allowDecimals: unit.allowDecimals,
        precision: unit.precision,
        isBase: unit.isBase,
        sortOrder: unit.sortOrder,
        active: true,
      })),
      skipDuplicates: true,
    });
    console.log('[units] SUNAT units seeded successfully');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TOP UNITS POR RUBRO (UX - Dropdown ordenado)
// ════════════════════════════════════════════════════════════════════════════
const TOP_UNITS_BODEGA = ['NIU', 'KGM', 'LTR', 'MLT', 'DZN', 'BX', 'PK', 'C62', 'SA', 'BE', 'GRM', 'BO'];
const TOP_UNITS_FERRETERIA = ['NIU', 'KGM', 'GRM', 'MTR', 'CMT', 'MMT', 'MTK', 'LTR', 'MLT', 'BX', 'PK', 'SA', 'BE', 'C62', 'RL', 'ST'];
const TOP_UNITS_GENERAL = ['NIU', 'KGM', 'LTR', 'MTR', 'C62'];

// ══════════════════════════════════════════════════════════════════════════════
// GET - Listar unidades disponibles
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // 1. Verificar autenticación (permitir SUPERADMIN sin storeId)
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // ✅ DESKTOP: Seedear unidades automáticamente si no existen
    await ensureUnitsExist();

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get('kind') as UnitKind | null;
    const showAll = searchParams.get('all') === 'true';
    const profileParam = searchParams.get('profile') as 'BODEGA' | 'FERRETERIA' | null;

    // 2. Obtener perfil de la tienda (si existe storeId)
    let store = null;
    if (user.storeId) {
      store = await prisma.store.findUnique({
        where: { id: user.storeId },
        select: { 
          businessProfile: true,
          featureFlags: {
            where: { key: FeatureFlagKey.ENABLE_ADVANCED_UNITS, enabled: true },
          },
        },
      });
    }

    const hasAdvancedUnitsFlag = (store?.featureFlags?.length || 0) > 0;
    const isFerreteria = store?.businessProfile === 'FERRETERIA';
    const effectiveProfile = profileParam || store?.businessProfile || 'BODEGA';
    const showAdvanced = hasAdvancedUnitsFlag || isFerreteria || showAll;

    // 3. Determinar topUnits según perfil
    const topUnitsOrder = effectiveProfile === 'FERRETERIA' 
      ? TOP_UNITS_FERRETERIA 
      : effectiveProfile === 'BODEGA'
        ? TOP_UNITS_BODEGA
        : TOP_UNITS_GENERAL;

    // 4. Construir filtro
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      active: true,
    };

    // Filtrar por tipo (GOODS o SERVICES)
    if (kind) {
      where.kind = kind;
    }

    // ✅ MÓDULO F2.1: TODAS las unidades SUNAT disponibles para TODAS las tiendas
    // (Requerimiento SUNAT: el catálogo completo debe estar disponible)
    // La UI ordena por topUnits del perfil para UX, pero no filtra

    // 5. Obtener unidades
    const units = await prisma.unit.findMany({
      where,
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        code: true,
        sunatCode: true,
        name: true,
        displayName: true,
        symbol: true,
        kind: true,
        allowDecimals: true,
        precision: true,
        isBase: true,
        sortOrder: true,
      },
    });

    // 6. Formatear y ordenar por topUnits primero
    const formattedUnits = units.map(unit => ({
      ...unit,
      label: unit.displayName || unit.name,
      value: unit.id,
      // Formato para dropdown: "NIU — UNIDAD (BIENES)"
      sunatLabel: unit.sunatCode 
        ? `${unit.sunatCode} — ${unit.displayName || unit.name}` 
        : unit.name,
      // Posición en topUnits (-1 si no está)
      topOrder: unit.sunatCode ? topUnitsOrder.indexOf(unit.sunatCode) : -1,
    }));

    // Ordenar: topUnits primero (por su orden), luego el resto por sortOrder
    formattedUnits.sort((a, b) => {
      const aTop = a.topOrder >= 0 ? a.topOrder : 999;
      const bTop = b.topOrder >= 0 ? b.topOrder : 999;
      if (aTop !== bTop) return aTop - bTop;
      return (a.sortOrder || 100) - (b.sortOrder || 100);
    });

    // Separar topUnits del resto para la UI
    const topUnits = formattedUnits.filter(u => u.topOrder >= 0);
    const otherUnits = formattedUnits.filter(u => u.topOrder < 0);

    return NextResponse.json({ 
      units: formattedUnits,
      topUnits,
      otherUnits,
      count: formattedUnits.length,
      businessProfile: store?.businessProfile || 'BODEGA',
      advancedUnitsEnabled: showAdvanced,
    });

  } catch (error) {
    console.error('[Units API] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST - Crear unidad personalizada
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // 1. Verificar autenticación
    const session = await getSessionOrThrow();

    // 2. Verificar tienda activa
    await requireStoreActive(session.storeId);

    // 3. ✅ GUARD: Verificar flag
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_ADVANCED_UNITS);

    // 4. Solo OWNER puede crear unidades
    requireRole(session.role, ['OWNER']);

    // 5. Parsear y validar body
    const body = await request.json();
    const { code, name, symbol, isBase } = body;

    if (!code || !name || !symbol) {
      return NextResponse.json(
        { error: 'Campos requeridos: code, name, symbol' },
        { status: 400 }
      );
    }

    // 6. Verificar que el código no exista
    const existing = await prisma.unit.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Ya existe una unidad con código ${code}` },
        { status: 409 }
      );
    }

    // 7. Crear unidad
    const unit = await prisma.unit.create({
      data: {
        code: code.toUpperCase(),
        name,
        symbol,
        isBase: isBase ?? false,
      },
    });

    return NextResponse.json({ 
      message: 'Unidad creada exitosamente',
      unit,
    }, { status: 201 });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
