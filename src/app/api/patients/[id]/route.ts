import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_PATIENTS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { name, phone, birthDate, gender, address, allergies, conditions, notes, active } = body;

    const existing = await prisma.patient.findFirst({ where: { id, storeId: user.storeId } });
    if (!existing) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });

    const patient = await prisma.patient.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(birthDate !== undefined && { birthDate: birthDate ? new Date(birthDate) : null }),
        ...(gender !== undefined && { gender }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(allergies !== undefined && { allergies: allergies?.trim() || null }),
        ...(conditions !== undefined && { conditions: conditions?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    });

    return NextResponse.json({ patient });
  } catch (error) {
    console.error('Error updating patient:', error);
    return NextResponse.json({ error: 'Error al actualizar paciente' }, { status: 500 });
  }
}
