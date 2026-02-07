import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';

/**
 * GET /api/pos/init
 * ✅ MÓDULO 18.2: Endpoint unificado de inicialización del POS
 * Combina 5+ llamadas API en 1 sola para reducir latencia inicial
 * 
 * Antes: 5 llamadas secuenciales = ~500ms
 * Después: 1 llamada paralela = ~100ms
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const storeId = session.storeId;
    const userId = session.userId;

    // 🚀 Ejecutar todas las consultas en paralelo
    const [
      store,
      user,
      currentShift,
      operationalLimits,
      featureFlags,
    ] = await Promise.all([
      // 1. Datos de la tienda
      prisma.store.findUnique({
        where: { id: storeId },
        select: {
          id: true,
          name: true,
          isDemoStore: true,
        },
      }),

      // 2. Datos del usuario
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
        },
      }),

      // 3. Turno actual
      prisma.shift.findFirst({
        where: {
          storeId: storeId,
          closedAt: null,
        },
        orderBy: { openedAt: 'desc' },
      }),

      // 4. Límites operacionales
      prisma.operationalLimit.findUnique({
        where: { storeId: storeId },
      }),

      // 5. Feature flags relevantes para POS
      Promise.all([
        isFeatureEnabled(storeId, 'ENABLE_SUNAT' as any),
        isFeatureEnabled(storeId, 'ENABLE_SERVICES' as any),
        isFeatureEnabled(storeId, 'ADVANCED_UNITS' as any),
        isFeatureEnabled(storeId, 'SHOW_QUICK_SELL' as any),
        isFeatureEnabled(storeId, 'ENABLE_PROMOTIONS' as any),
      ]),
    ]);

    const [
      sunatEnabled,
      servicesEnabled,
      advancedUnitsEnabled,
      showQuickSell,
      promotionsEnabled,
    ] = featureFlags;

    // Verificar si es superadmin
    const isSuperAdmin = user?.role === 'OWNER'; // Owner es el rol más alto

    return NextResponse.json({
      // Tienda
      store: store ? {
        id: store.id,
        name: store.name,
        is_demo_store: store.isDemoStore ?? false,
      } : null,

      // Usuario
      user: user ? {
        id: user.id,
        email: user.email,
        role: user.role,
        isSuperAdmin,
      } : null,

      // Turno
      shift: currentShift ? {
        id: currentShift.id,
        openingCash: currentShift.openingCash ? Number(currentShift.openingCash) : 0,
        openedAt: currentShift.openedAt,
        openedBy: currentShift.openedById,
      } : null,

      // Límites operacionales
      limits: operationalLimits ? {
        maxDiscountPercent: operationalLimits.maxDiscountPercent ? Number(operationalLimits.maxDiscountPercent) : null,
        maxManualDiscountAmount: operationalLimits.maxManualDiscountAmount ? Number(operationalLimits.maxManualDiscountAmount) : null,
        maxSaleTotal: operationalLimits.maxSaleTotal ? Number(operationalLimits.maxSaleTotal) : null,
        maxItemsPerSale: operationalLimits.maxItemsPerSale ? Number(operationalLimits.maxItemsPerSale) : null,
        maxReceivableBalance: operationalLimits.maxReceivableBalance ? Number(operationalLimits.maxReceivableBalance) : null,
      } : null,

      // Feature flags del POS
      features: {
        sunatEnabled,
        servicesEnabled,
        advancedUnitsEnabled,
        showQuickSell,
        promotionsEnabled,
      },
    });
  } catch (error) {
    console.error('Error in /api/pos/init:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al inicializar POS' },
      { status: 500 }
    );
  }
}
