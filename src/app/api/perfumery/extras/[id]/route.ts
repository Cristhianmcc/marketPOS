/**
 * PATCH /api/perfumery/extras/[id] (OWNER): precio, ml extra, producto, estado.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { extraInclude, parseExtraInput, serializeExtra } from '../shared';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  const { id } = await params;
  const existing = await prisma.perfumeExtra.findFirst({
    where: { id, storeId: session.storeId },
    select: { extraEssenceMl: true, storeProductId: true },
  });
  if (!existing) return NextResponse.json({ error: 'Extra no encontrado' }, { status: 404 });

  const parsed = await parseExtraInput(await request.json().catch(() => null), session.storeId, {
    extraEssenceMl: existing.extraEssenceMl?.toNumber() ?? null,
    storeProductId: existing.storeProductId,
  });
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const updated = await prisma.perfumeExtra.update({
      where: { id },
      data: parsed.data as Prisma.PerfumeExtraUncheckedUpdateInput,
      include: extraInclude,
    });
    return NextResponse.json({ extra: serializeExtra(updated) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un extra con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}
