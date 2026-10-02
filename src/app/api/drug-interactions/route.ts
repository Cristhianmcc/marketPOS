import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });

    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');

    // Verificar interacciones entre una lista de principios activos
    if (action === 'check') {
      const drugsParam = searchParams.get('drugs');
      if (!drugsParam) return NextResponse.json({ interactions: [] });

      const drugs = drugsParam.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
      if (drugs.length < 2) return NextResponse.json({ interactions: [] });

      // Buscar todas las interacciones entre los fármacos dados
      const interactions = await prisma.drugInteraction.findMany({
        where: {
          OR: drugs.flatMap((drugA, i) =>
            drugs.slice(i + 1).map(drugB => ({
              OR: [
                { drugA: { equals: drugA, mode: 'insensitive' as const }, drugB: { equals: drugB, mode: 'insensitive' as const } },
                { drugA: { equals: drugB, mode: 'insensitive' as const }, drugB: { equals: drugA, mode: 'insensitive' as const } },
              ],
            }))
          ),
        },
        orderBy: { severity: 'desc' },
      });

      return NextResponse.json({ interactions });
    }

    // Verificar interacciones de un fármaco con el historial de un paciente
    if (action === 'check-patient') {
      const patientId = searchParams.get('patientId');
      const drug = searchParams.get('drug')?.toLowerCase();
      if (!patientId || !drug) return NextResponse.json({ interactions: [] });

      // Obtener últimos medicamentos del paciente (últimos 90 días)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const recentMeds = await prisma.patientMedication.findMany({
        where: {
          patientId,
          dispensedAt: { gte: ninetyDaysAgo },
          patient: { storeId: user.storeId },
        },
        select: { genericName: true },
        distinct: ['genericName'],
      });

      const patientDrugs: string[] = recentMeds
        .map((m: { genericName: string | null }) => m.genericName?.toLowerCase())
        .filter((g: string | undefined): g is string => !!g && g !== drug);

      if (patientDrugs.length === 0) return NextResponse.json({ interactions: [] });

      const interactions = await prisma.drugInteraction.findMany({
        where: {
          OR: patientDrugs.flatMap((patientDrug: string) => [
            { drugA: { equals: drug, mode: 'insensitive' as const }, drugB: { equals: patientDrug, mode: 'insensitive' as const } },
            { drugA: { equals: patientDrug, mode: 'insensitive' as const }, drugB: { equals: drug, mode: 'insensitive' as const } },
          ]),
        },
        orderBy: { severity: 'desc' },
      });

      return NextResponse.json({ interactions });
    }

    // Listar todas las interacciones (con paginación)
    const query = searchParams.get('query') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = 50;

    const where = query ? {
      OR: [
        { drugA: { contains: query, mode: 'insensitive' as const } },
        { drugB: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ],
    } : {};

    const [interactions, total] = await Promise.all([
      prisma.drugInteraction.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { drugA: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.drugInteraction.count({ where }),
    ]);

    return NextResponse.json({ interactions, total, page, pageSize });
  } catch (error) {
    console.error('GET /api/drug-interactions error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// Crear una interacción (o seed masivo)
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const body = await req.json();

    // Seed masivo
    if (body.seed && Array.isArray(body.interactions)) {
      const created = await prisma.$transaction(
        body.interactions.map((i: { drugA: string; drugB: string; severity: string; description: string; recommendation?: string }) =>
          prisma.drugInteraction.upsert({
            where: { drugA_drugB: { drugA: i.drugA.toLowerCase(), drugB: i.drugB.toLowerCase() } },
            create: {
              drugA: i.drugA.toLowerCase(),
              drugB: i.drugB.toLowerCase(),
              severity: i.severity as any,
              description: i.description,
              recommendation: i.recommendation || null,
            },
            update: {
              severity: i.severity as any,
              description: i.description,
              recommendation: i.recommendation || null,
            },
          })
        )
      );
      return NextResponse.json({ message: `${created.length} interacciones cargadas` });
    }

    // Crear una interacción individual
    const { drugA, drugB, severity, description, recommendation } = body;
    if (!drugA || !drugB || !severity || !description) {
      return NextResponse.json({ error: 'drugA, drugB, severity y description son obligatorios' }, { status: 400 });
    }

    const interaction = await prisma.drugInteraction.create({
      data: {
        drugA: drugA.toLowerCase(),
        drugB: drugB.toLowerCase(),
        severity,
        description,
        recommendation: recommendation || null,
      },
    });

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Esta interacción ya existe' }, { status: 409 });
    }
    console.error('POST /api/drug-interactions error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
