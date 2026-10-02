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

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_PATIENTS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const id = searchParams.get('id');

    // Detalle de un paciente
    if (id) {
      const patient = await prisma.patient.findFirst({
        where: { id, storeId: user.storeId },
        include: {
          medicationHistory: {
            orderBy: { dispensedAt: 'desc' },
            take: 50,
          },
          controlledEntries: {
            orderBy: { saleDate: 'desc' },
            take: 20,
          },
          drugInteractionLogs: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });
      if (!patient) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
      return NextResponse.json({ patient });
    }

    // Lista de pacientes
    const where: any = { storeId: user.storeId, active: true };
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { dni: { contains: query } },
        { phone: { contains: query } },
      ];
    }

    const patients = await prisma.patient.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { medicationHistory: true, controlledEntries: true } },
      },
    });

    return NextResponse.json({ patients });
  } catch (error) {
    console.error('Error fetching patients:', error);
    return NextResponse.json({ error: 'Error al obtener pacientes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_PATIENTS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const body = await req.json();
    const { dni, name, phone, birthDate, gender, address, allergies, conditions, notes } = body;

    if (!dni?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'DNI y nombre son obligatorios' }, { status: 400 });
    }

    // Verificar si ya existe
    const existing = await prisma.patient.findFirst({
      where: { storeId: user.storeId, dni: dni.trim() },
    });
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un paciente con ese DNI', patient: existing }, { status: 409 });
    }

    const patient = await prisma.patient.create({
      data: {
        storeId: user.storeId,
        dni: dni.trim(),
        name: name.trim(),
        phone: phone?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        gender: gender || null,
        address: address?.trim() || null,
        allergies: allergies?.trim() || null,
        conditions: conditions?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json({ patient }, { status: 201 });
  } catch (error) {
    console.error('Error creating patient:', error);
    return NextResponse.json({ error: 'Error al crear paciente' }, { status: 500 });
  }
}
