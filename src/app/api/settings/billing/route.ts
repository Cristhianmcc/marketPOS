// src/app/api/settings/billing/route.ts
// MÓDULO 16: Obtener estado de billing para owner

import { NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { 
  getSubscription, 
  computeEffectiveStatus, 
  getDaysUntilExpiration,
  getGraceDaysRemaining
} from '@/lib/subscriptionStatus';

export async function GET() {
  try {
    const session = await getSessionOrThrow();
    const subscription = await getSubscription(session.storeId);

    if (!subscription) {
      return NextResponse.json({
        hasSubscription: false,
        effectiveStatus: null,
        canOperate: false,
      });
    }

    const effectiveStatus = computeEffectiveStatus(subscription);
    const daysUntilExpiration = getDaysUntilExpiration(subscription);
    const graceDaysRemaining = getGraceDaysRemaining(subscription);

    return NextResponse.json({
      hasSubscription: true,
      subscription: {
        planCode: subscription.planCode,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        trialEndsAt: subscription.trialEndsAt?.toISOString() || null,
        priceAmount: subscription.priceAmount,
        priceCurrency: subscription.priceCurrency,
        billingCycle: subscription.billingCycle,
      },
      effectiveStatus,
      canOperate: ['TRIAL', 'ACTIVE', 'PAST_DUE'].includes(effectiveStatus),
      daysUntilExpiration,
      graceDaysRemaining,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error al obtener información de facturación' },
      { status: error.message === 'No autenticado' ? 401 : 500 }
    );
  }
}
