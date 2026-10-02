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

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_SUPPLIERS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const active = searchParams.get('active');

    const where: any = { storeId: user.storeId };
    if (active !== null) where.active = active === 'true';
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { ruc: { contains: query } },
        { contactName: { contains: query, mode: 'insensitive' } },
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { purchaseOrders: true } },
      },
    });

    return NextResponse.json({ suppliers });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({ error: 'Error al obtener proveedores' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });
    if (user.role !== 'OWNER') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_SUPPLIERS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const body = await req.json();
    const { name, ruc, contactName, phone, email, address, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        storeId: user.storeId,
        name: name.trim(),
        ruc: ruc?.trim() || null,
        contactName: contactName?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    console.error('Error creating supplier:', error);
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 });
  }
}
