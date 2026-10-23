import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStoreUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey, Prisma } from '@prisma/client';

interface PurchaseOrderItemInput {
  storeProductId: string;
  quantityOrdered: number;
  unitCost: number;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentStoreUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

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
    const user = await getCurrentStoreUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_SUPPLIERS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const body = await req.json();
    const { supplierId, notes, expectedDate } = body;
    const items: unknown = body.items;

    if (!supplierId) return NextResponse.json({ error: 'Proveedor requerido' }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos un producto' }, { status: 400 });
    }

    // Verificar proveedor
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, storeId: user.storeId, active: true },
    });
    if (!supplier) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });

    const hasInvalidItem = items.some((item: {
      storeProductId?: unknown;
      quantityOrdered?: unknown;
      unitCost?: unknown;
    }) => (
      typeof item.storeProductId !== 'string'
      || !item.storeProductId.trim()
      || typeof item.quantityOrdered !== 'number'
      || !Number.isFinite(item.quantityOrdered)
      || item.quantityOrdered <= 0
      || typeof item.unitCost !== 'number'
      || !Number.isFinite(item.unitCost)
      || item.unitCost < 0
    ));

    if (hasInvalidItem) {
      return NextResponse.json({ error: 'Productos inválidos en la orden' }, { status: 400 });
    }

    const validItems = items as PurchaseOrderItemInput[];

    const requestedProductIds: string[] = Array.from(
      new Set(validItems.map((item) => item.storeProductId)),
    );

    if (requestedProductIds.length === 0) {
      return NextResponse.json({ error: 'Productos inválidos en la orden' }, { status: 400 });
    }

    const ownedProducts = await prisma.storeProduct.findMany({
      where: {
        storeId: user.storeId,
        id: { in: requestedProductIds },
      },
      select: { id: true },
    });
    const ownedProductIds = new Set(ownedProducts.map(product => product.id));
    const foreignOrMissingProduct = requestedProductIds.find(id => !ownedProductIds.has(id));

    if (foreignOrMissingProduct) {
      return NextResponse.json(
        { error: 'Uno o más productos no pertenecen a esta tienda' },
        { status: 400 }
      );
    }

    // Generar número correlativo
    const lastOrder = await prisma.purchaseOrder.findFirst({
      where: { storeId: user.storeId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

    // Calcular total
    const totalAmount = validItems.reduce(
      (sum: number, item) =>
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
          create: validItems.map((item) => ({
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
