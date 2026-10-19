import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

// Compatibilidad para clientes anteriores. El checkout actual registra este
// historial dentro de la transacción de la venta y no necesita llamar esta ruta.
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.storeId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const storeId = user.storeId;
    const enabled = await isFeatureEnabled(storeId, FeatureFlagKey.ENABLE_PATIENTS);
    if (!enabled) {
      return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    }

    const body = await req.json();
    const patientId = typeof body.patientId === 'string' ? body.patientId : '';
    const saleId = typeof body.saleId === 'string' ? body.saleId : '';
    const consultReason = typeof body.consultReason === 'string'
      ? body.consultReason.trim() || null
      : null;

    if (!patientId || !saleId) {
      return NextResponse.json(
        { error: 'patientId y saleId son obligatorios' },
        { status: 400 }
      );
    }

    const [patient, sale] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: patientId, storeId, active: true },
        select: { id: true },
      }),
      prisma.sale.findFirst({
        where: { id: saleId, storeId },
        select: {
          id: true,
          items: {
            where: { isService: false },
            select: {
              id: true,
              productName: true,
              genericName: true,
              concentration: true,
              quantity: true,
            },
          },
        },
      }),
    ]);

    if (!patient) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
    }
    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }
    if (sale.items.length === 0) {
      return NextResponse.json(
        { error: 'La venta no contiene medicamentos registrables' },
        { status: 422 }
      );
    }

    const created = await prisma.patientMedication.createMany({
      data: sale.items.map((item) => ({
        id: `patient-med:${patient.id}:${item.id}`,
        patientId: patient.id,
        saleId: sale.id,
        consultReason,
        productName: item.productName,
        genericName: item.genericName,
        concentration: item.concentration,
        quantity: item.quantity,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json(
      {
        success: true,
        count: created.count,
        duplicate: created.count === 0,
      },
      { status: created.count > 0 ? 201 : 200 }
    );
  } catch (error) {
    console.error('Error creating patient medication:', error);
    return NextResponse.json(
      { error: 'Error al registrar dispensación' },
      { status: 500 }
    );
  }
}
