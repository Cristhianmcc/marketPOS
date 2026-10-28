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
import { getCurrentStoreUser } from '@/lib/session';
import { requireFeature, isFeatureEnabled } from '@/lib/featureFlags';
import { canEditTransition, expressSurchargeFor, freeWorkLine, parsePromisedAt, resolveItemPrice, WorkOrderRuleError } from '@/lib/workOrders/rules';
import { lockWorkOrder, refundAdvances } from '@/lib/workOrders/payments';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';

const shiftRepo = new PrismaShiftRepository();

// ══════════════════════════════════════════════════════════════════════════════
// GET - Listar órdenes de trabajo
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentStoreUser();
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
  /** Trabajo libre (sin serviceId): descripción, detalle (ej. "5 kg") y precio */
  itemName?: string;
  itemContent?: string;
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
  express?: boolean;
  promisedAt?: string | null;
}

/** Porcentaje express configurado por la tienda (por defecto 50 %). */
async function expressPercentFor(storeId: string): Promise<number> {
  const settings = await prisma.storeSettings.findUnique({ where: { storeId }, select: { expressSurchargePercent: true } });
  return settings?.expressSurchargePercent ?? 50;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentStoreUser();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const body: CreateWorkOrderInput = await request.json();
    const { customerId, notes, items } = body;
    const express = body.express === true;
    let promisedAt: Date | null | undefined;
    try {
      promisedAt = parsePromisedAt(body.promisedAt);
    } catch (error) {
      if (error instanceof WorkOrderRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }

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
      let catalogPrice = 0;
      let allowDecimals = true;
      let freeLine = false; // trabajo libre: el precio lo escribe quien recibe

      if (item.type === 'PRODUCT') {
        if (!item.storeProductId) {
          return NextResponse.json({ error: 'storeProductId requerido para productos' }, { status: 400 });
        }
        const sp = await prisma.storeProduct.findFirst({
          where: { id: item.storeProductId, storeId: session.storeId, active: true },
          include: { product: { select: { name: true, content: true, unitType: true, baseUnit: { select: { allowDecimals: true } } } } },
        });
        if (!sp) {
          return NextResponse.json({ error: `Producto ${item.storeProductId} no encontrado` }, { status: 400 });
        }
        itemName = sp.product.name;
        itemContent = sp.product.content;
        catalogPrice = sp.price.toNumber();
        allowDecimals = sp.product.baseUnit?.allowDecimals ?? sp.product.unitType === 'KG';
      } else if (item.type === 'SERVICE') {
        if (!servicesEnabled) {
          return NextResponse.json({ error: 'Módulo de servicios no habilitado' }, { status: 403 });
        }
        if (!item.serviceId) {
          try {
            ({ itemName, itemContent } = freeWorkLine(item));
          } catch (error) {
            if (error instanceof WorkOrderRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
            throw error;
          }
          freeLine = true;
          catalogPrice = Number(item.unitPrice);
          allowDecimals = false;
        } else {
          const service = await prisma.service.findFirst({
            where: { id: item.serviceId, storeId: session.storeId, active: true },
            include: { baseUnit: { select: { allowDecimals: true } } },
          });
          if (!service) {
            return NextResponse.json({ error: `Servicio ${item.serviceId} no encontrado` }, { status: 400 });
          }
          itemName = service.name;
          itemContent = '(Servicio)';
          catalogPrice = service.price.toNumber();
          allowDecimals = service.baseUnit ? service.baseUnit.allowDecimals : true;
        }
      }

      let unitPrice: number;
      try {
        unitPrice = resolveItemPrice({
          itemName, quantityBase: item.quantityBase, allowDecimals, catalogPrice,
          requestedPrice: item.unitPrice, isOwner: session.role === 'OWNER' || freeLine,
        });
      } catch (error) {
        if (error instanceof WorkOrderRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
        throw error;
      }
      const itemSubtotal = item.quantityBase * unitPrice;
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
        unitPrice: new Prisma.Decimal(unitPrice),
        subtotal: new Prisma.Decimal(itemSubtotal),
        notes: item.notes || null,
      });
    }

    const expressSurcharge = expressSurchargeFor(subtotal, await expressPercentFor(session.storeId), express);

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
          express,
          expressSurcharge: new Prisma.Decimal(expressSurcharge),
          promisedAt: promisedAt ?? null,
          total: new Prisma.Decimal(Math.round((subtotal + expressSurcharge) * 100) / 100),
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
  express?: boolean;
  promisedAt?: string | null;
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getCurrentStoreUser();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const body: UpdateWorkOrderInput = await request.json();
    const { id, status, customerId, notes, items } = body;
    let promisedAt: Date | null | undefined;
    try {
      promisedAt = parsePromisedAt(body.promisedAt);
    } catch (error) {
      if (error instanceof WorkOrderRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }

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

    if (status !== undefined && !canEditTransition(existingOrder.status, status)) {
      const reason = status === WorkOrderStatus.CLOSED
        ? 'Para entregar la orden hay que cobrarla'
        : status === WorkOrderStatus.CANCELLED
          ? 'Para anular la orden usa Cancelar'
          : `No se puede pasar de ${existingOrder.status} a ${status}`;
      return NextResponse.json({ error: reason }, { status: 409 });
    }

    // Verificar servicos habilitados si hay items de servicio
    const servicesEnabled = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_SERVICES);

    const workOrder = await prisma.$transaction(async (tx) => {
      // Bloquear la orden: un adelanto simultáneo no puede quedar mayor al total
      const locked = await lockWorkOrder(tx, session.storeId, id);
      if (locked.status === WorkOrderStatus.CLOSED || locked.status === WorkOrderStatus.CANCELLED) {
        throw new WorkOrderRuleError('No se puede editar una orden cerrada o cancelada', 409);
      }

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
          let catalogPrice = 0;
          let allowDecimals = true;
          let freeLine = false; // trabajo libre: el precio lo escribe quien recibe

          if (item.type === 'PRODUCT') {
            if (!item.storeProductId) {
              throw new WorkOrderRuleError('storeProductId requerido para productos');
            }
            const sp = await tx.storeProduct.findFirst({
              where: { id: item.storeProductId, storeId: session.storeId, active: true },
              include: { product: { select: { name: true, content: true, unitType: true, baseUnit: { select: { allowDecimals: true } } } } },
            });
            if (!sp) {
              throw new WorkOrderRuleError(`Producto ${item.storeProductId} no encontrado`);
            }
            itemName = sp.product.name;
            itemContent = sp.product.content;
            catalogPrice = sp.price.toNumber();
            allowDecimals = sp.product.baseUnit?.allowDecimals ?? sp.product.unitType === 'KG';
          } else if (item.type === 'SERVICE') {
            if (!servicesEnabled) {
              throw new WorkOrderRuleError('Módulo de servicios no habilitado');
            }
            if (!item.serviceId) {
              ({ itemName, itemContent } = freeWorkLine(item));
              freeLine = true;
              catalogPrice = Number(item.unitPrice);
              allowDecimals = false;
            } else {
              const service = await tx.service.findFirst({
                where: { id: item.serviceId, storeId: session.storeId, active: true },
                include: { baseUnit: { select: { allowDecimals: true } } },
              });
              if (!service) {
                throw new WorkOrderRuleError(`Servicio ${item.serviceId} no encontrado`);
              }
              itemName = service.name;
              itemContent = '(Servicio)';
              catalogPrice = service.price.toNumber();
              allowDecimals = service.baseUnit ? service.baseUnit.allowDecimals : true;
            }
          }

          const unitPrice = resolveItemPrice({
            itemName, quantityBase: item.quantityBase, allowDecimals, catalogPrice,
            requestedPrice: item.unitPrice, isOwner: session.role === 'OWNER' || freeLine,
          });
          const itemSubtotal = item.quantityBase * unitPrice;
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
            unitPrice: new Prisma.Decimal(unitPrice),
            subtotal: new Prisma.Decimal(itemSubtotal),
            notes: item.notes || null,
          });
        }

        await tx.workOrderItem.createMany({ data: itemsToCreate });
      }

      const express = body.express !== undefined ? body.express === true : locked.express;
      const expressSurcharge = expressSurchargeFor(newSubtotal, await expressPercentFor(session.storeId), express);
      const newTotal = Math.round((newSubtotal + expressSurcharge) * 100) / 100;

      if (newTotal + 0.005 < locked.advancePaid.toNumber()) {
        throw new WorkOrderRuleError(`El total no puede quedar por debajo del adelanto ya cobrado (S/ ${locked.advancePaid.toFixed(2)})`, 409);
      }

      // Actualizar orden
      const updateData: Prisma.WorkOrderUpdateInput = {
        subtotal: new Prisma.Decimal(newSubtotal),
        express,
        expressSurcharge: new Prisma.Decimal(expressSurcharge),
        total: new Prisma.Decimal(newTotal), // subtotal + recargo express (sin descuentos)
        ...(promisedAt !== undefined && { promisedAt }),
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
    if (error instanceof WorkOrderRuleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
    const session = await getCurrentStoreUser();
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

    // Con adelanto: se cancela (no se borra) y se devuelve el adelanto en el turno abierto
    if (order.advancePaid.toNumber() > 0) {
      const shift = await shiftRepo.getCurrentShift(session.storeId, session.userId);
      if (!shift) {
        return NextResponse.json({ error: 'La orden tiene adelanto: abre tu turno para registrar la devolución.' }, { status: 400 });
      }
      const refunded = await prisma.$transaction(async (tx) => {
        const locked = await lockWorkOrder(tx, session.storeId, id);
        if (locked.saleId || locked.status === WorkOrderStatus.CLOSED || locked.status === WorkOrderStatus.CANCELLED) {
          throw new WorkOrderRuleError('La orden ya fue cobrada o cancelada', 409);
        }
        const amount = await refundAdvances(tx, {
          storeId: session.storeId, workOrderId: id, shiftId: shift.id, userId: session.userId,
          reason: `Devolución por cancelación de OT #${locked.orderNumber}`,
        });
        await tx.workOrder.update({ where: { id }, data: { status: WorkOrderStatus.CANCELLED } });
        return amount;
      });
      return NextResponse.json({ message: 'Orden cancelada y adelanto devuelto', refunded });
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
    if (error instanceof WorkOrderRuleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('DELETE /api/work-orders error:', error);
    if (error.code === 'FEATURE_DISABLED') {
      return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Error al eliminar orden' }, { status: 500 });
  }
}
