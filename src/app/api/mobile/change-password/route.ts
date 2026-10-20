// ✅ MÓDULO MÓVIL — CAMBIAR CONTRASEÑA
// POST /api/mobile/change-password  { currentPassword, newPassword }
// El dueño cambia la contraseña de su cuenta Monterrial desde el celular.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/infra/db/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { requireMobileOwner, allowRequest } from '@/lib/mobileOwner';
import { logAudit } from '@/lib/auditLog';

const BodySchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(100),
});

export async function POST(request: Request) {
  try {
    const owner = await requireMobileOwner();
    if (owner instanceof NextResponse) return owner;

    const limit = allowRequest(`change-password:${owner.userId}`, 5, 15 * 60);
    if (!limit.allowed) {
      return NextResponse.json(
        { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' },
        { status: 429 },
      );
    }

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { id: owner.userId }, select: { password: true } });
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.password))) {
      return NextResponse.json({ code: 'WRONG_PASSWORD', message: 'La contraseña actual no es correcta' }, { status: 403 });
    }

    await prisma.user.update({
      where: { id: owner.userId },
      data: { password: await hashPassword(parsed.data.newPassword) },
    });

    await logAudit({
      storeId: owner.storeId,
      userId: owner.userId,
      action: 'MOBILE_PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: owner.userId,
      meta: { channel: 'mobile' },
    });

    return NextResponse.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    console.error('[mobile/change-password] Error:', error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Error al cambiar la contraseña' }, { status: 500 });
  }
}
