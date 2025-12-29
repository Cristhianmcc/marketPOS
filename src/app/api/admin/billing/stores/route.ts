// src/app/api/admin/billing/stores/route.ts
// MÓDULO 16: Lista de tiendas con información de billing (SUPERADMIN)

import { NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { computeEffectiveStatus, getDaysUntilExpiration } from '@/lib/subscriptionStatus';
import { isSuperAdmin } from '@/lib/superadmin';

export async function GET() {
  try {
    const session = await getSessionOrThrow();

    // Solo SUPERADMIN puede acceder
    if (!isSuperAdmin(session.email)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const stores = await prisma.store.findMany({
      include: {
        subscription: true,
        _count: {
          select: {
            users: true,
            sales: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const storesWithBilling = stores.map((store) => {
      const sub = store.subscription;
      const effectiveStatus = sub ? computeEffectiveStatus({
        ...sub,
        priceAmount: sub.priceAmount.toNumber(),
      }) : null;

      const daysUntilExpiration = sub ? getDaysUntilExpiration({
        ...sub,
        priceAmount: sub.priceAmount.toNumber(),
      }) : null;

      return {
        id: store.id,
        name: store.name,
        status: store.status,
        createdAt: store.createdAt,
        userCount: store._count.users,
        salesCount: store._count.sales,
        subscription: sub ? {
          id: sub.id,
          planCode: sub.planCode,
          status: sub.status,
          effectiveStatus,
          currentPeriodEnd: sub.currentPeriodEnd,
          trialEndsAt: sub.trialEndsAt,
          priceAmount: sub.priceAmount.toNumber(),
          priceCurrency: sub.priceCurrency,
          billingCycle: sub.billingCycle,
          daysUntilExpiration,
        } : null,
      };
    });

    return NextResponse.json(storesWithBilling);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error al obtener tiendas' },
      { status: error.message === 'No autenticado' ? 401 : 500 }
    );
  }
}
