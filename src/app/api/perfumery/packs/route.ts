/**
 * GET  /api/perfumery/packs[?all=1]  packs a precio cerrado de la sede
 * POST /api/perfumery/packs (OWNER)
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { packInclude, parsePackInput, serializePack } from '../extras/shared';

export async function GET(request: NextRequest) {
  const { session, error } = await getPerfumerySession();
  if (error) return error;
  const packs = await prisma.perfumePack.findMany({
    where: { storeId: session.storeId, ...(request.nextUrl.searchParams.get('all') === '1' ? {} : { active: true }) },
    include: packInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json({ packs: packs.map(serializePack) });
}

export async function POST(request: NextRequest) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  const parsed = await parsePackInput(await request.json().catch(() => null), session.storeId, false);
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const created = await prisma.perfumePack.create({
      data: { storeId: session.storeId, ...parsed.data } as Prisma.PerfumePackUncheckedCreateInput,
      include: packInclude,
    });
    return NextResponse.json({ pack: serializePack(created) }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un pack con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}
