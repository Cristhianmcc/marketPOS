import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { hashPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // Auth
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.LICENSE_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { storeId, storeName, ownerEmail, ownerName, ruc, address, phone } = body;

    if (!storeId || !storeName || !ownerEmail) {
      return NextResponse.json({ error: 'storeId, storeName y ownerEmail son requeridos' }, { status: 400 });
    }

    // Verificar si ya existe
    const existing = await prisma.store.findUnique({ where: { id: storeId } });
    if (existing) {
      return NextResponse.json({ ok: true, already: true });
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 30);
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.$transaction(async (tx) => {
      await tx.store.create({
        data: {
          id: storeId,
          name: storeName,
          ruc: ruc || null,
          address: address || null,
          phone: phone || null,
          status: 'ACTIVE',
        },
      });

      // El email puede ya existir si el mismo owner tiene otra tienda registrada.
      // Usamos un email único por tienda para evitar conflicto con el constraint @unique.
      const normalizedEmail = ownerEmail.toLowerCase().trim();
      const cloudEmail = `${storeId}__${normalizedEmail}`;
      const hashedPw = await hashPassword(Math.random().toString(36) + Date.now());
      await tx.user.create({
        data: {
          storeId,
          email: cloudEmail,
          name: ownerName || ownerEmail,
          password: hashedPw,
          role: 'OWNER',
          active: true,
        },
      });

      await tx.subscription.create({
        data: {
          storeId,
          planCode: 'STARTER',
          status: 'TRIAL',
          startAt: now,
          trialEndsAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          priceAmount: 0,
          priceCurrency: 'PEN',
          billingCycle: 'MONTHLY',
          notes: `Desktop install: ${storeName} (${ownerEmail})`,
        },
      });
    });

    console.log(`[license/register-store] Registered ${storeId} (${storeName}) in cloud`);
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[license/register-store] Error:', error);
    return NextResponse.json({ error: 'Error registering store' }, { status: 500 });
  }
}
