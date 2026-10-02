import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey, Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_SUPPLIERS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const supplierId = searchParams.get('supplierId') || undefined;

    const where: any = { storeId: user.storeId };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, ruc: true } },
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            storeProduct: {
              select: {
                id: true,
                price: true,
                stock: true,
                product: { select: { id: true, name: true, barcode: true, internalSku: true } },
              },
            },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return NextResponse.json({ error: 'Error al obtener órdenes de compra' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_SUPPLIERS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const body = await req.json();
    const { supplierId, notes, expectedDate, items } = body;

    if (!supplierId) return NextResponse.json({ error: 'Proveedor requerido' }, { status: 400 });
    if (!items?.length) return NextResponse.json({ error: 'Debe incluir al menos un producto' }, { status: 400 });

    // Verificar proveedor
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, storeId: user.storeId, active: true },
    });
    if (!supplier) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });

    // Generar número correlativo
    const lastOrder = await prisma.purchaseOrder.findFirst({
      where: { storeId: user.storeId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

    // Calcular total
    const totalAmount = items.reduce(
      (sum: number, item: { quantityOrdered: number; unitCost: number }) =>
        sum + item.quantityOrdered * item.unitCost,
      0
    );

    const order = await prisma.purchaseOrder.create({
      data: {
        storeId: user.storeId,
        supplierId,
        createdById: user.userId,
        orderNumber,
        notes: notes?.trim() || null,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        totalAmount,
        items: {
          create: items.map((item: { storeProductId: string; quantityOrdered: number; unitCost: number }) => ({
            storeProductId: item.storeProductId,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
          })),
        },
      },
      include: {
        supplier: { select: { name: true } },
        items: {
          include: {
            storeProduct: {
              select: { product: { select: { name: true } } },
            },
          },
        },
      },
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    return NextResponse.json({ error: 'Error al crear orden de compra' }, { status: 500 });
  }
}
