// ✅ MÓDULO MÓVIL — REGISTRO DE TIENDA
// POST /api/mobile/register
// Crea en la nube la tienda, su dueño (OWNER) y una suscripción de prueba,
// igual que /api/license/register-store para el desktop, pero sin clave
// compartida: el dueño elige su correo y contraseña y queda con sesión iniciada.
// Así la tienda aparece en el panel SUPERADMIN, donde se le asignan planes.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/infra/db/prisma';
import { hashPassword } from '@/lib/auth';
import { setSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { getClientIP } from '@/lib/rateLimit';
import { logAudit } from '@/lib/auditLog';
import { allowRequest } from '@/lib/mobileOwner';

const TRIAL_DAYS = 30;

const RegisterSchema = z.object({
  storeName: z.string().trim().min(3, 'El nombre del negocio debe tener al menos 3 letras').max(80),
  ruc: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'El RUC tiene 11 dígitos')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  ownerName: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(120),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
});

export async function POST(request: Request) {
  try {
    // Pocos registros por IP: evita que un script cree tiendas de prueba sin fin.
    const ip = getClientIP(request);
    const limit = allowRequest(`mobile-register:${ip}`, 5, 60 * 60);
    if (!limit.allowed) {
      return NextResponse.json(
        { code: 'TOO_MANY_REQUESTS', error: `Demasiados registros. Intenta en ${Math.ceil(limit.waitSeconds / 60)} minutos.` },
        { status: 429, headers: { 'Retry-After': String(limit.waitSeconds) } },
      );
    }

    const parsed = RegisterSchema.safeParse(await request.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? 'Datos inválidos';
      return NextResponse.json({ code: 'INVALID_DATA', error: first }, { status: 400 });
    }
    const data = parsed.data;

    // Los correos de superadministrador nunca se pueden registrar como dueños.
    if (isSuperAdmin(data.email)) {
      return NextResponse.json({ code: 'EMAIL_RESERVED', error: 'Ese correo no se puede usar' }, { status: 400 });
    }

    const exists = await prisma.user.findFirst({
      where: { email: { equals: data.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json(
        { code: 'EMAIL_IN_USE', error: 'Ya existe una cuenta con ese correo. Usa "Ya tengo cuenta".' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(data.password);
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    const { store, user } = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: data.storeName,
          ruc: data.ruc || null,
          address: data.address || null,
          phone: data.phone || null,
          status: 'ACTIVE',
          businessProfile: 'BODEGA',
        },
      });
      const user = await tx.user.create({
        data: {
          storeId: store.id,
          email: data.email,
          name: data.ownerName,
          password: passwordHash,
          role: 'OWNER',
          active: true,
        },
      });
      await tx.storeSettings.create({
        data: {
          storeId: store.id,
          ticketHeaderLine1: data.storeName,
          ticketHeaderLine2: data.ruc ? `RUC: ${data.ruc}` : null,
          ticketFooter: '¡Gracias por su compra!',
        },
      });
      await tx.subscription.create({
        data: {
          storeId: store.id,
          planCode: 'STARTER',
          status: 'TRIAL',
          startAt: now,
          trialEndsAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          priceAmount: 0,
          priceCurrency: 'PEN',
          billingCycle: 'MONTHLY',
          notes: `App móvil: ${data.storeName}`,
        },
      });
      return { store, user };
    });

    await setSession({
      userId: user.id,
      storeId: store.id,
      email: user.email,
      name: user.name,
      role: 'OWNER',
    });

    await logAudit({
      storeId: store.id,
      userId: user.id,
      action: 'MOBILE_STORE_REGISTERED',
      entityType: 'STORE',
      entityId: store.id,
      ip,
      userAgent: request.headers.get('user-agent'),
      meta: { channel: 'mobile', trialDays: TRIAL_DAYS },
    });

    return NextResponse.json(
      {
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: 'OWNER', storeId: store.id },
        store: { id: store.id, name: store.name },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[mobile/register] Error:', error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', error: 'Error interno del servidor' }, { status: 500 });
  }
}
