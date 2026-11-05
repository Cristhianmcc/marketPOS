/**
 * GET  /api/perfumery/extras[?all=1]  extras de la línea (feromonas, esencia extra)
 *      con ?products=1 incluye los productos de la sede para elegir (OWNER)
 * POST /api/perfumery/extras (OWNER)
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { extraInclude, listStockProducts, parseExtraInput, serializeExtra } from './shared';

export async function GET(request: NextRequest) {
  const { session, error } = await getPerfumerySession();
  if (error) return error;
  const params = request.nextUrl.searchParams;
  const extras = await prisma.perfumeExtra.findMany({
    where: { storeId: session.storeId, ...(params.get('all') === '1' ? {} : { active: true }) },
    include: extraInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const products = params.get('products') === '1' && session.role === 'OWNER'
    ? await listStockProducts(session.storeId)
    : undefined;
  return NextResponse.json({ extras: extras.map(serializeExtra), products });
}

export async function POST(request: NextRequest) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  const parsed = await parseExtraInput(await request.json().catch(() => null), session.storeId, null);
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const created = await prisma.perfumeExtra.create({
      data: { storeId: session.storeId, ...parsed.data } as Prisma.PerfumeExtraUncheckedCreateInput,
      include: extraInclude,
    });
    return NextResponse.json({ extra: serializeExtra(created) }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un extra con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}
