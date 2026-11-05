import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getCurrentStoreUser, type StoreSessionData } from '@/lib/session';

/**
 * Sesión de una tienda con perfil Perfumería. Devuelve la respuesta de error
 * lista para retornar cuando no aplica.
 */
export async function getPerfumerySession(
  { ownerOnly = false } = {}
): Promise<{ session: StoreSessionData; error?: never } | { session?: never; error: NextResponse }> {
  const session = await getCurrentStoreUser();
  if (!session) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (ownerOnly && session.role !== 'OWNER') {
    return { error: NextResponse.json({ error: 'Solo el dueño puede cambiar el catálogo de perfumería' }, { status: 403 }) };
  }
  const store = await prisma.store.findUnique({ where: { id: session.storeId }, select: { businessProfile: true } });
  if (store?.businessProfile !== 'PERFUMERIA') {
    return { error: NextResponse.json({ error: 'La tienda no tiene el rubro Perfumería' }, { status: 403 }) };
  }
  return { session };
}
