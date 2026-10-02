import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_CONTROLLED_BOOK);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = 50;

    const where: any = { storeId: user.storeId };

    if (query) {
      where.OR = [
        { productName: { contains: query, mode: 'insensitive' } },
        { patientName: { contains: query, mode: 'insensitive' } },
        { patientDni: { contains: query } },
        { prescriptionNumber: { contains: query } },
      ];
    }

    if (from || to) {
      where.saleDate = {};
      if (from) where.saleDate.gte = new Date(from);
      if (to) where.saleDate.lte = new Date(to + 'T23:59:59');
    }

    const [entries, total] = await Promise.all([
      prisma.controlledBookEntry.findMany({
        where,
        orderBy: { saleDate: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        include: {
          patient: { select: { id: true, name: true, dni: true } },
          dispensedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.controlledBookEntry.count({ where }),
    ]);

    return NextResponse.json({ entries, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error fetching controlled book:', error);
    return NextResponse.json({ error: 'Error al obtener libro de controlados' }, { status: 500 });
  }
}

// POST manual (para casos donde se necesita registrar fuera del checkout)
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_CONTROLLED_BOOK);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const body = await req.json();
    const { saleId, saleNumber, saleDate, productName, genericName, concentration, laboratory,
            batchNumber, quantity, prescriptionNumber, prescribedBy, cmpNumber,
            patientId, patientName, patientDni, notes } = body;

    if (!prescriptionNumber?.trim()) {
      return NextResponse.json({ error: 'El número de receta es obligatorio' }, { status: 400 });
    }
    if (!patientName?.trim() || !patientDni?.trim()) {
      return NextResponse.json({ error: 'Nombre y DNI del paciente son obligatorios' }, { status: 400 });
    }
    if (!productName?.trim()) {
      return NextResponse.json({ error: 'El nombre del producto es obligatorio' }, { status: 400 });
    }

    const entry = await prisma.controlledBookEntry.create({
      data: {
        storeId: user.storeId,
        saleId: saleId || 'MANUAL',
        saleNumber: saleNumber || 0,
        saleDate: saleDate ? new Date(saleDate) : new Date(),
        productName: productName.trim(),
        genericName: genericName?.trim() || null,
        concentration: concentration?.trim() || null,
        laboratory: laboratory?.trim() || null,
        batchNumber: batchNumber?.trim() || null,
        quantity: quantity || 1,
        prescriptionNumber: prescriptionNumber.trim(),
        prescribedBy: prescribedBy?.trim() || null,
        cmpNumber: cmpNumber?.trim() || null,
        patientId: patientId || null,
        patientName: patientName.trim(),
        patientDni: patientDni.trim(),
        dispensedById: user.userId,
        dispensedByName: user.name || user.email,
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('Error creating controlled book entry:', error);
    return NextResponse.json({ error: 'Error al registrar en libro de controlados' }, { status: 500 });
  }
}
