import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

// POST /api/patients/medication
// Registra el historial de medicamentos dispensados en una venta
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.storeId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const enabled = await isFeatureEnabled(user.storeId as string, FeatureFlagKey.ENABLE_PATIENTS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const body = await req.json();
    const { patientId, saleId, consultReason, items } = body;

    if (!patientId || !saleId) {
      return NextResponse.json({ error: 'patientId y saleId son obligatorios' }, { status: 400 });
    }

    // Verificar que el paciente pertenece a la tienda
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, storeId: user.storeId as string },
    });
    if (!patient) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
    }

    // Verificar que la venta pertenece a la tienda
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, storeId: user.storeId as string },
    });
    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    // Evitar duplicados: si ya existe un registro para este paciente+venta, no crear otro
    const existing = await prisma.patientMedication.findFirst({
      where: { patientId, saleId },
    });
    if (existing) {
      return NextResponse.json({ message: 'Ya registrado', medication: existing });
    }

    // items puede ser un array de { productName, genericName, concentration, quantity }
    // o puede estar vacío — en ese caso creamos un registro resumen
    const itemsToCreate: any[] = [];

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        itemsToCreate.push({
          patientId,
          saleId,
          consultReason: consultReason?.trim() || null,
          productName: item.productName || '(Sin nombre)',
          genericName: item.genericName || null,
          concentration: item.concentration || null,
          quantity: Number(item.quantity) || 1,
        });
      }
    } else {
      // Sin items específicos — registro genérico
      itemsToCreate.push({
        patientId,
        saleId,
        consultReason: consultReason?.trim() || null,
        productName: '(Dispensación)',
        quantity: 1,
      });
    }

    const created = await prisma.patientMedication.createMany({
      data: itemsToCreate,
    });

    return NextResponse.json({ success: true, count: created.count }, { status: 201 });
  } catch (error) {
    console.error('Error creating patient medication:', error);
    return NextResponse.json({ error: 'Error al registrar dispensación' }, { status: 500 });
  }
}
