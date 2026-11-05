/**
 * GET  /api/perfumery/presentations[?all=1]  presentaciones de la sede
 * POST /api/perfumery/presentations (OWNER)  crea una presentación
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { parsePresentationInput, presentationInclude, serializePresentation } from './shared';

export async function GET(request: NextRequest) {
  const { session, error } = await getPerfumerySession();
  if (error) return error;
  const includeInactive = request.nextUrl.searchParams.get('all') === '1';
  const presentations = await prisma.perfumePresentation.findMany({
    where: { storeId: session.storeId, ...(includeInactive ? {} : { active: true }) },
    include: presentationInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json({ presentations: presentations.map(serializePresentation) });
}

export async function POST(request: NextRequest) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  const parsed = await parsePresentationInput(await request.json().catch(() => null), session.storeId, false);
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const created = await prisma.perfumePresentation.create({
      data: { storeId: session.storeId, ...parsed.data } as Prisma.PerfumePresentationUncheckedCreateInput,
      include: presentationInclude,
    });
    return NextResponse.json({ presentation: serializePresentation(created) }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe una presentación con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}
