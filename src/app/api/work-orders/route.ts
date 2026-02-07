/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F4 — /api/work-orders (Órdenes de Trabajo / Cotizaciones)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * CRUD para órdenes de trabajo de ferretería.
 * Requiere flag ENABLE_WORK_ORDERS habilitado.
 * 
 * Flujo: DRAFT → APPROVED → IN_PROGRESS → READY → CLOSED
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey, WorkOrderStatus, WorkOrderItemType, Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { requireFeature, isFeatureEnabled } from '@/lib/featureFlags';

// ══════════════════════════════════════════════════════════════════════════════
// GET - Listar órdenes de trabajo
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // ✅ GUARD: Flag requerido
    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as WorkOrderStatus | null;
    const customerId = searchParams.get('customerId');
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Prisma.WorkOrderWhereInput = {
      storeId: session.storeId,
    };

    if (status) {
      where.status = status;
    }

    if (customerId) {
      where.customerId = customerId;
    }

    if (q) {
      where.OR = [
        { orderNumber: { equals: parseInt(q) || -1 } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
          items: {
            include: {
              storeProduct: {
                include: { product: { select: { name: true, content: true } } },
              },
              service: { select: { id: true, name: true } },
              unitUsed: { select: { id: true, code: true, symbol: true } },
            },
          },
          sale: { select: { id: true, saleNumber: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.workOrder.count({ where }),
    ]);

    return NextResponse.json({
      data: workOrders,
      total,
      limit,
      offset,
    });

  } catch (error: any) {
    console.error('GET /api/work-orders error:', error);
    if (error.code === 'FEATURE_DISABLED') {
      return NextResponse.json({ error: 'Módulo de órdenes de trabajo no habilitado' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST - Crear orden de trabajo
// ══════════════════════════════════════════════════════════════════════════════

interface CreateItemInput {
  type: 'PRODUCT' | 'SERVICE';
  storeProductId?: string;
  serviceId?: string;
  unitIdUsed?: string;
  quantityOriginal?: number;
  quantityBase: number;
  conversionFactor?: number;
  unitPrice: number;
  notes?: string;
}

interface CreateWorkOrderInput {
  customerId?: string;
  notes?: string;
  items: CreateItemInput[];
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const body: CreateWorkOrderInput = await request.json();
    const { customerId, notes, items } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Debe agregar al menos un item' }, { status: 400 });
    }

    // Validar cliente si se proporciona
    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, storeId: session.storeId },
      });
      if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 400 });
      }
    }

    // Obtener siguiente número correlativo
    const lastOrder = await prisma.workOrder.findFirst({
      where: { storeId: session.storeId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const nextNumber = (lastOrder?.orderNumber ?? 0) + 1;

    // Verificar si servicios están habilitados (para items tipo SERVICE)
    const servicesEnabled = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_SERVICES);

    // Preparar items con snapshots
    const itemsToCreate: Omit<Prisma.WorkOrderItemCreateManyInput, 'workOrderId'>[] = [];
    let subtotal = 0;

    for (const item of items) {
      let itemName = '';
      let itemContent: string | null = null;

      if (item.type === 'PRODUCT') {
        if (!item.storeProductId) {
          return NextResponse.json({ error: 'storeProductId requerido para productos' }, { status: 400 });
        }
        const sp = await prisma.storeProduct.findFirst({
          where: { id: item.storeProductId, storeId: session.storeId, active: true },
          include: { product: { select: { name: true, content: true } } },
        });
        if (!sp) {
          return NextResponse.json({ error: `Producto ${item.storeProductId} no encontrado` }, { status: 400 });
        }
        itemName = sp.product.name;
        itemContent = sp.product.content;
      } else if (item.type === 'SERVICE') {
        if (!servicesEnabled) {
          return NextResponse.json({ error: 'Módulo de servicios no habilitado' }, { status: 403 });
        }
        if (!item.serviceId) {
          return NextResponse.json({ error: 'serviceId requerido para servicios' }, { status: 400 });
        }
        const service = await prisma.service.findFirst({
          where: { id: item.serviceId, storeId: session.storeId, active: true },
        });
        if (!service) {
          return NextResponse.json({ error: `Servicio ${item.serviceId} no encontrado` }, { status: 400 });
        }
        itemName = service.name;
        itemContent = '(Servicio)';
      }

      const itemSubtotal = item.quantityBase * item.unitPrice;
      subtotal += itemSubtotal;

      itemsToCreate.push({
        type: item.type as WorkOrderItemType,
        storeProductId: item.type === 'PRODUCT' ? item.storeProductId : null,
        serviceId: item.type === 'SERVICE' ? item.serviceId : null,
        itemName,
        itemContent,
        unitIdUsed: item.unitIdUsed || null,
        quantityOriginal: item.quantityOriginal ? new Prisma.Decimal(item.quantityOriginal) : null,
        quantityBase: new Prisma.Decimal(item.quantityBase),
        conversionFactor: item.conversionFactor ? new Prisma.Decimal(item.conversionFactor) : null,
        unitPrice: new Prisma.Decimal(item.unitPrice),
        subtotal: new Prisma.Decimal(itemSubtotal),
        notes: item.notes || null,
      });
    }

    // Crear orden con items en transacción
    const workOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.workOrder.create({
        data: {
          storeId: session.storeId,
          orderNumber: nextNumber,
          customerId: customerId || null,
          status: WorkOrderStatus.DRAFT,
          notes: notes || null,
          subtotal: new Prisma.Decimal(subtotal),
          discount: new Prisma.Decimal(0),
          total: new Prisma.Decimal(subtotal),
        },
      });

      // Crear items
      await tx.workOrderItem.createMany({
        data: itemsToCreate.map((item) => ({
          ...item,
          workOrderId: order.id,
        })),
      });

      // Retornar con items incluidos
      return tx.workOrder.findUnique({
        where: { id: order.id },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: {
            include: {
              storeProduct: { include: { product: { select: { name: true, content: true } } } },
              service: { select: { id: true, name: true } },
              unitUsed: { select: { id: true, code: true, symbol: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({ data: workOrder }, { status: 201 });

  } catch (error: any) {
    console.error('POST /api/work-orders error:', error);
    if (error.code === 'FEATURE_DISABLED') {
      return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Error al crear orden de trabajo' }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PATCH - Actualizar orden de trabajo
// ══════════════════════════════════════════════════════════════════════════════

interface UpdateWorkOrderInput {
  id: string;
  status?: WorkOrderStatus;
  customerId?: string | null;
  notes?: string;
  items?: CreateItemInput[]; // Reemplaza todos los items si se proporciona
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const body: UpdateWorkOrderInput = await request.json();
    const { id, status, customerId, notes, items } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de orden requerido' }, { status: 400 });
    }

    // Verificar orden existe y pertenece a la tienda
    const existingOrder = await prisma.workOrder.findFirst({
      where: { id, storeId: session.storeId },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    // No permitir editar órdenes cerradas o canceladas
    if (existingOrder.status === WorkOrderStatus.CLOSED || existingOrder.status === WorkOrderStatus.CANCELLED) {
      return NextResponse.json({ error: 'No se puede editar una orden cerrada o cancelada' }, { status: 400 });
    }

    // Verificar servicos habilitados si hay items de servicio
    const servicesEnabled = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_SERVICES);

    const workOrder = await prisma.$transaction(async (tx) => {
      // Si se proporcionan items, recalcular y reemplazar
      let newSubtotal = existingOrder.subtotal.toNumber();

      if (items && items.length > 0) {
        // Eliminar items existentes
        await tx.workOrderItem.deleteMany({
          where: { workOrderId: id },
        });

        // Crear nuevos items
        newSubtotal = 0;
        const itemsToCreate: Prisma.WorkOrderItemCreateManyInput[] = [];

        for (const item of items) {
          let itemName = '';
          let itemContent: string | null = null;

          if (item.type === 'PRODUCT') {
            if (!item.storeProductId) {
              throw new Error('storeProductId requerido para productos');
            }
            const sp = await tx.storeProduct.findFirst({
              where: { id: item.storeProductId, storeId: session.storeId, active: true },
              include: { product: { select: { name: true, content: true } } },
            });
            if (!sp) {
              throw new Error(`Producto ${item.storeProductId} no encontrado`);
            }
            itemName = sp.product.name;
            itemContent = sp.product.content;
          } else if (item.type === 'SERVICE') {
            if (!servicesEnabled) {
              throw new Error('Módulo de servicios no habilitado');
            }
            if (!item.serviceId) {
              throw new Error('serviceId requerido para servicios');
            }
            const service = await tx.service.findFirst({
              where: { id: item.serviceId, storeId: session.storeId, active: true },
            });
            if (!service) {
              throw new Error(`Servicio ${item.serviceId} no encontrado`);
            }
            itemName = service.name;
            itemContent = '(Servicio)';
          }

          const itemSubtotal = item.quantityBase * item.unitPrice;
          newSubtotal += itemSubtotal;

          itemsToCreate.push({
            workOrderId: id,
            type: item.type as WorkOrderItemType,
            storeProductId: item.type === 'PRODUCT' ? item.storeProductId : null,
            serviceId: item.type === 'SERVICE' ? item.serviceId : null,
            itemName,
            itemContent,
            unitIdUsed: item.unitIdUsed || null,
            quantityOriginal: item.quantityOriginal ? new Prisma.Decimal(item.quantityOriginal) : null,
            quantityBase: new Prisma.Decimal(item.quantityBase),
            conversionFactor: item.conversionFactor ? new Prisma.Decimal(item.conversionFactor) : null,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            subtotal: new Prisma.Decimal(itemSubtotal),
            notes: item.notes || null,
          });
        }

        await tx.workOrderItem.createMany({ data: itemsToCreate });
      }

      // Actualizar orden
      const updateData: Prisma.WorkOrderUpdateInput = {
        subtotal: new Prisma.Decimal(newSubtotal),
        total: new Prisma.Decimal(newSubtotal), // Por ahora sin descuentos
      };

      if (status !== undefined) {
        updateData.status = status;
      }
      if (customerId !== undefined) {
        updateData.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
      }
      if (notes !== undefined) {
        updateData.notes = notes;
      }

      return tx.workOrder.update({
        where: { id },
        data: updateData,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: {
            include: {
              storeProduct: { include: { product: { select: { name: true, content: true } } } },
              service: { select: { id: true, name: true } },
              unitUsed: { select: { id: true, code: true, symbol: true } },
            },
          },
          sale: { select: { id: true, saleNumber: true, createdAt: true } },
        },
      });
    });

    return NextResponse.json({ data: workOrder });

  } catch (error: any) {
    console.error('PATCH /api/work-orders error:', error);
    if (error.code === 'FEATURE_DISABLED') {
      return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Error al actualizar orden' }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE - Cancelar/eliminar orden de trabajo
// ══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Solo OWNER puede eliminar
    if (session.role !== 'OWNER') {
      return NextResponse.json({ error: 'Solo el propietario puede eliminar órdenes' }, { status: 403 });
    }

    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de orden requerido' }, { status: 400 });
    }

    const order = await prisma.workOrder.findFirst({
      where: { id, storeId: session.storeId },
    });

    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    // Si ya tiene venta asociada, no eliminar sino marcar como cancelada
    if (order.saleId) {
      await prisma.workOrder.update({
        where: { id },
        data: { status: WorkOrderStatus.CANCELLED },
      });
      return NextResponse.json({ message: 'Orden marcada como cancelada (ya tiene venta asociada)' });
    }

    // Si es DRAFT, eliminar completamente
    if (order.status === WorkOrderStatus.DRAFT) {
      await prisma.workOrder.delete({
        where: { id },
      });
      return NextResponse.json({ message: 'Orden eliminada' });
    }

    // Para otros estados, marcar como cancelada
    await prisma.workOrder.update({
      where: { id },
      data: { status: WorkOrderStatus.CANCELLED },
    });

    return NextResponse.json({ message: 'Orden cancelada' });

  } catch (error: any) {
    console.error('DELETE /api/work-orders error:', error);
    if (error.code === 'FEATURE_DISABLED') {
      return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Error al eliminar orden' }, { status: 500 });
  }
}
