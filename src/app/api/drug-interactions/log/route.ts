import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

// Registrar que el usuario reconoció/canceló una alerta de interacción
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await req.json();
    const { entries } = body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'entries es requerido' }, { status: 400 });
    }

    const logs = await prisma.$transaction(
      entries.map((e: { saleId?: string; patientId?: string; drugA: string; drugB: string; severity: string; description: string; action: string }) =>
        prisma.drugInteractionLog.create({
          data: {
            storeId: session.storeId!,
            saleId: e.saleId || null,
            patientId: e.patientId || null,
            drugA: e.drugA,
            drugB: e.drugB,
            severity: e.severity as any,
            description: e.description,
            action: e.action,
            acknowledgedBy: session.userId,
          },
        })
      )
    );

    return NextResponse.json({ logs }, { status: 201 });
  } catch (error) {
    console.error('POST /api/drug-interactions/log error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
