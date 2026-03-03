/**
 * GET /api/desktop/license
 *
 * Endpoint local solo para el desktop (Electron main process).
 * No requiere sesión — protegido por header x-desktop-app.
 *
 * Retorna: storeId + estado de suscripción local
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import {
  computeEffectiveStatus,
  isStoreAllowedToOperate,
  getDaysUntilExpiration,
} from '@/lib/subscriptionStatus';

export async function GET(req: NextRequest) {
  // Solo desde el proceso desktop
  if (req.headers.get('x-desktop-app') !== 'true') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Obtener la primera (y única) tienda local
    const store = await prisma.store.findFirst({
      select: { id: true, name: true },
    });

    if (!store) {
      return NextResponse.json({
        storeId: null,
        canOperate: true, // sin tienda = setup en progreso, no bloquear
        status: 'NO_SUBSCRIPTION',
        daysRemaining: 0,
      });
    }

    const sub = await prisma.subscription.findUnique({
      where: { storeId: store.id },
    });

    if (!sub) {
      return NextResponse.json({
        storeId: store.id,
        storeName: store.name,
        canOperate: true, // sin suscripción en local = trial no creado aún
        status: 'NO_SUBSCRIPTION',
        daysRemaining: 0,
      });
    }

    const subInfo = { ...sub, priceAmount: Number(sub.priceAmount) };
    const effectiveStatus = computeEffectiveStatus(subInfo);
    const canOperate = isStoreAllowedToOperate(effectiveStatus);
    const daysRemaining = getDaysUntilExpiration(subInfo);

    return NextResponse.json({
      storeId: store.id,
      storeName: store.name,
      canOperate,
      status: effectiveStatus,
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      trialEndsAt: sub.trialEndsAt?.toISOString() || null,
      planCode: sub.planCode,
      daysRemaining,
    });
  } catch (error) {
    console.error('[desktop/license] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
