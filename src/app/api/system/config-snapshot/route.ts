// GET /api/system/config-snapshot
// ✅ MÓDULO 16.2: Estado de Features y Límites Operativos

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede ver configuración
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos para ver la configuración' },
        { status: 403 }
      );
    }

    const storeId = session.storeId;

    // Obtener feature flags
    const featureFlags = await prisma.featureFlag.findMany({
      where: { storeId },
      select: {
        key: true,
        enabled: true,
      },
    });

    // Convertir a objeto key-value
    const featureFlagsMap: Record<string, boolean> = {};
    featureFlags.forEach(flag => {
      featureFlagsMap[flag.key] = flag.enabled;
    });

    // Obtener límites operativos
    const operationalLimit = await prisma.operationalLimit.findUnique({
      where: { storeId },
      select: {
        maxDiscountPercent: true,
        maxManualDiscountAmount: true,
        maxSaleTotal: true,
        maxItemsPerSale: true,
        maxReceivableBalance: true,
      },
    });

    // Convertir Decimal a number
    const operationalLimits = operationalLimit ? {
      maxDiscountPercent: operationalLimit.maxDiscountPercent?.toNumber() || null,
      maxManualDiscountAmount: operationalLimit.maxManualDiscountAmount?.toNumber() || null,
      maxSaleTotal: operationalLimit.maxSaleTotal?.toNumber() || null,
      maxItemsPerSale: operationalLimit.maxItemsPerSale || null,
      maxReceivableBalance: operationalLimit.maxReceivableBalance?.toNumber() || null,
    } : {
      maxDiscountPercent: null,
      maxManualDiscountAmount: null,
      maxSaleTotal: null,
      maxItemsPerSale: null,
      maxReceivableBalance: null,
    };

    return NextResponse.json({
      storeId,
      featureFlags: featureFlagsMap,
      operationalLimits,
    });
  } catch (error) {
    console.error('[Config Snapshot] Error:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}
