/**
 * PATCH /api/store/laundry-price  { price: number | null }
 *
 * Precio del kilo de ropa vigente en la lavandería (solo el dueño). Ruta propia
 * para no tocar el resto de la configuración de la tienda.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getCurrentStoreUser } from '@/lib/session';

export async function PATCH(request: NextRequest) {
  const session = await getCurrentStoreUser();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') {
    return NextResponse.json({ error: 'Solo el dueño puede cambiar el precio del kilo' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const raw = body?.price;
  const price = raw === null || raw === '' ? null : Number(raw);
  if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 999)) {
    return NextResponse.json({ error: 'Precio por kilo inválido' }, { status: 400 });
  }
  const value = price === null ? null : new Prisma.Decimal(Math.round(price * 100) / 100);

  const settings = await prisma.storeSettings.upsert({
    where: { storeId: session.storeId },
    update: { laundryKgPrice: value },
    create: { storeId: session.storeId, laundryKgPrice: value },
    select: { laundryKgPrice: true },
  });
  return NextResponse.json({ laundryKgPrice: settings.laundryKgPrice?.toNumber() ?? null });
}
