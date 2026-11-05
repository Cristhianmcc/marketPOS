// ✅ MÓDULO MÓVIL: utilidades compartidas por /api/mobile/*
// La app móvil guarda la tienda en el celular y usa la nube para:
// registrar la tienda, consultar la licencia y guardar respaldos.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export interface MobileOwner {
  userId: string;
  storeId: string;
  email: string;
}

/**
 * Exige una sesión de dueño (OWNER) con tienda. El storeId SIEMPRE sale de la
 * sesión, nunca del cuerpo de la petición: cada dueño solo ve lo suyo.
 */
export async function requireMobileOwner(): Promise<MobileOwner | NextResponse> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: 'No autenticado' }, { status: 401 });
  }
  if (session.role !== 'OWNER' || !session.storeId) {
    return NextResponse.json(
      { code: 'FORBIDDEN', message: 'Solo el dueño de la tienda puede usar esta función' },
      { status: 403 },
    );
  }
  // La sesión dura 7 días: se confirma que el usuario y la tienda sigan activos.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { active: true, storeId: true, store: { select: { status: true } } },
  });
  if (!user || !user.active || user.storeId !== session.storeId || user.store?.status !== 'ACTIVE') {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Cuenta o tienda desactivada' }, { status: 403 });
  }
  return { userId: session.userId, storeId: session.storeId, email: session.email };
}

// Límite de intentos en memoria, propio de estas rutas (un solo proceso en Render).
const hits = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, max: number, windowSeconds: number): { allowed: boolean; waitSeconds: number } {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, waitSeconds: 0 };
  }
  if (entry.count >= max) {
    return { allowed: false, waitSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, waitSeconds: 0 };
}
