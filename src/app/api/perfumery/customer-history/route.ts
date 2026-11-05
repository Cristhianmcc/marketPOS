/**
 * GET /api/perfumery/customer-history?customerId=
 * Para el POS: si el cliente puede llevar relleno y sus últimas compras de
 * perfume en esta sede ("la última vez llevó M1141 100 ml").
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { hasRefillPurchase, recentPerfumePurchases } from '@/lib/perfumery/customerHistory';

export async function GET(request: NextRequest) {
  const { session, error } = await getPerfumerySession();
  if (error) return error;
  const customerId = request.nextUrl.searchParams.get('customerId') ?? '';
  const customer = customerId
    ? await prisma.customer.findFirst({ where: { id: customerId, storeId: session.storeId }, select: { id: true } })
    : null;
  if (!customer) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  const [refillEligible, purchases] = await Promise.all([
    hasRefillPurchase(prisma, session.storeId, customer.id),
    recentPerfumePurchases(prisma, session.storeId, customer.id),
  ]);
  return NextResponse.json({ refillEligible, purchases });
}
