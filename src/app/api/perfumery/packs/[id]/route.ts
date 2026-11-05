/**
 * PATCH /api/perfumery/packs/[id] (OWNER): precio, tamaño, cantidad, regalo, estado.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { packInclude, parsePackInput, serializePack } from '../../extras/shared';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  const { id } = await params;
  const existing = await prisma.perfumePack.findFirst({ where: { id, storeId: session.storeId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Pack no encontrado' }, { status: 404 });

  const parsed = await parsePackInput(await request.json().catch(() => null), session.storeId, true);
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const updated = await prisma.perfumePack.update({
      where: { id },
      data: parsed.data as Prisma.PerfumePackUncheckedUpdateInput,
      include: packInclude,
    });
    return NextResponse.json({ pack: serializePack(updated) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un pack con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}
