/**
 * GET /api/license/verify?storeId=xxx
 *
 * Endpoint cloud para que el desktop verifique su licencia.
 * No requiere sesión de usuario — autenticado con x-api-key.
 *
 * Retorna:
 * {
 *   canOperate: boolean,
 *   status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'NO_SUBSCRIPTION',
 *   currentPeriodEnd: string (ISO),
 *   trialEndsAt: string | null,
 *   planCode: string,
 *   daysRemaining: number,
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import {
  computeEffectiveStatus,
  isStoreAllowedToOperate,
  getDaysUntilExpiration,
} from '@/lib/subscriptionStatus';
import { verifyStoreLicenseToken } from '@/lib/cloudLicenseTokens';

const LICENSE_API_KEY = process.env.LICENSE_API_KEY || '';

export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId');
    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 });
    }

    const authorization = req.headers.get('authorization');
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const apiKey = req.headers.get('x-api-key');
    const validStoreCredential = Boolean(bearer && verifyStoreLicenseToken(bearer, storeId));
    const validLegacyKey = Boolean(LICENSE_API_KEY && apiKey === LICENSE_API_KEY);
    if (!validStoreCredential && !validLegacyKey) {
      return NextResponse.json({ error: 'Credencial de licencia inválida' }, { status: 401 });
    }

    // 3. Buscar suscripción
    const sub = await prisma.subscription.findUnique({
      where: { storeId },
      select: {
        planCode: true,
        status: true,
        startAt: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        graceEndsAt: true,
        suspendedAt: true,
        cancelledAt: true,
        priceAmount: true,
        priceCurrency: true,
        billingCycle: true,
        notes: true,
        id: true,
        storeId: true,
      },
    });

    if (!sub) {
      return NextResponse.json({
        canOperate: false,
        status: 'NO_SUBSCRIPTION',
        currentPeriodEnd: null,
        trialEndsAt: null,
        planCode: null,
        daysRemaining: 0,
      });
    }

    const subInfo = {
      ...sub,
      priceAmount: Number(sub.priceAmount),
    };

    const effectiveStatus = computeEffectiveStatus(subInfo);
    const canOperate = isStoreAllowedToOperate(effectiveStatus);
    const daysRemaining = getDaysUntilExpiration(subInfo);

    return NextResponse.json({
      canOperate,
      status: effectiveStatus,
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      trialEndsAt: sub.trialEndsAt?.toISOString() || null,
      planCode: sub.planCode,
      daysRemaining,
    });

  } catch (error) {
    console.error('[license/verify] Error:', error);
    return NextResponse.json(
      { error: 'Error interno al verificar licencia' },
      { status: 500 }
    );
  }
}
