/**
 * PATCH /api/perfumery/presentations/[id] (OWNER)
 * Cambia precio, ml, envase, orden o estado. Las ventas ya hechas conservan su
 * snapshot; para retirar una presentación se desactiva (no se borra).
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { parsePresentationInput, presentationInclude, serializePresentation } from '../shared';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  const { id } = await params;
  const existing = await prisma.perfumePresentation.findFirst({
    where: { id, storeId: session.storeId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 });

  const parsed = await parsePresentationInput(await request.json().catch(() => null), session.storeId, true);
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const updated = await prisma.perfumePresentation.update({
      where: { id },
      data: parsed.data as Prisma.PerfumePresentationUncheckedUpdateInput,
      include: presentationInclude,
    });
    return NextResponse.json({ presentation: serializePresentation(updated) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe una presentación con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}
