/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F4 — /api/work-orders/[id]/convert-to-sale
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Convierte una orden de trabajo en venta.
 * - Crea Sale con los items de la OT
 * - Decrementa stock de productos
 * - Servicios NO decrementan stock
 * - Marca la OT como CLOSED y vincula con la venta
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey, WorkOrderStatus, Prisma, PaymentMethod } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getCurrentStoreUser } from '@/lib/session';
import { requireFeature } from '@/lib/featureFlags';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';
import { consumeSaleInventory, InventoryMutationError } from '@/lib/inventory/stockMutations';

class OrderAlreadyChargedError extends Error {}

const shiftRepo = new PrismaShiftRepository();

interface ConvertToSaleInput {
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO';
  amountPaid?: number;
  customerId?: string; // Para FIADO, puede usar el de la OT o uno diferente
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentStoreUser();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await requireFeature(session.storeId, FeatureFlagKey.ENABLE_WORK_ORDERS);

    const { id } = await params;
    const body: ConvertToSaleInput = await request.json();
    const { paymentMethod, amountPaid, customerId } = body;

    if (!paymentMethod) {
      return NextResponse.json({ error: 'Método de pago requerido' }, { status: 400 });
    }

    // Obtener la orden con sus items
    const workOrder = await prisma.workOrder.findFirst({
      where: { id, storeId: session.storeId },
      include: {
        items: {
          include: {
            storeProduct: {
              include: {
                product: {
                  include: { baseUnit: true }, // ✅ SUNAT: Para snapshot
                },
              },
            },
            service: true,
          },
        },
        customer: true,
      },
    });

    if (!workOrder) {
      return NextResponse.json({ error: 'Orden de trabajo no encontrada' }, { status: 404 });
    }

    // Validar estado - solo APPROVED, IN_PROGRESS o READY pueden convertirse
    const allowedStatuses: WorkOrderStatus[] = [
      WorkOrderStatus.APPROVED,
      WorkOrderStatus.IN_PROGRESS,
      WorkOrderStatus.READY,
    ];
    
    if (!allowedStatuses.includes(workOrder.status)) {
      return NextResponse.json({ 
        error: `No se puede convertir una orden en estado ${workOrder.status}. Estados permitidos: APPROVED, IN_PROGRESS, READY` 
      }, { status: 400 });
    }

    // Ya tiene venta asociada
    if (workOrder.saleId) {
      return NextResponse.json({ error: 'Esta orden ya fue convertida a venta' }, { status: 400 });
    }

    // Verificar turno abierto (excepto para FIADO)
    let shiftId: string | null = null;
    if (paymentMethod !== 'FIADO') {
      const currentShift = await shiftRepo.getCurrentShift(session.storeId, session.userId);
      if (!currentShift) {
        return NextResponse.json({ error: 'No tienes un turno abierto. Ve a Turnos y abre tu turno antes de procesar esta orden.' }, { status: 400 });
      }
      shiftId = currentShift.id;
    }

    // Para FIADO, cliente es requerido
    const finalCustomerId = customerId || workOrder.customerId;
    if (paymentMethod === 'FIADO' && !finalCustomerId) {
      return NextResponse.json({ error: 'Cliente requerido para ventas FIADO' }, { status: 400 });
    }

    // Validar pago en efectivo
    const total = workOrder.total.toNumber();
    if (paymentMethod === 'CASH') {
      if (amountPaid === undefined || amountPaid < total) {
        return NextResponse.json({ error: 'Monto pagado insuficiente' }, { status: 400 });
      }
    }

    // Validar stock disponible para productos
    for (const item of workOrder.items) {
      if (item.type === 'PRODUCT' && item.storeProduct) {
        const sp = item.storeProduct;
        if (sp.stock !== null) {
          const currentStock = sp.stock.toNumber();
          const requiredQty = item.quantityBase.toNumber();
          
          if (currentStock < requiredQty) {
            return NextResponse.json({
              error: `Stock insuficiente para ${sp.product.name}: disponible ${currentStock}, requerido ${requiredQty}`,
            }, { status: 409 });
          }
        }
      }
    }

    // Ejecutar conversión en transacción ACID
    const result = await prisma.$transaction(async (tx) => {
      // 0. Reservar la orden: solo una conversión puede pasarla a CLOSED.
      const claimed = await tx.workOrder.updateMany({
        where: { id: workOrder.id, storeId: session.storeId, saleId: null, status: { in: allowedStatuses } },
        data: { status: WorkOrderStatus.CLOSED },
      });
      if (claimed.count !== 1) throw new OrderAlreadyChargedError();

      // 1. Obtener siguiente número de venta (excluir ventas demo >= 90000)
      const lastSale = await tx.sale.findFirst({
        where: {
          storeId: session.storeId,
          isDemo: false,
          saleNumber: { lt: 90000 },
        },
        orderBy: { saleNumber: 'desc' },
        select: { saleNumber: true },
      });
      const nextSaleNumber = (lastSale?.saleNumber ?? 0) + 1;

      // 2. Calcular totales
      const subtotal = workOrder.subtotal.toNumber();
      const discount = workOrder.discount.toNumber();
      const saleTotal = workOrder.total.toNumber();
      const changeAmount = paymentMethod === 'CASH' && amountPaid ? amountPaid - saleTotal : null;

      // 3. Crear Sale
      const saleData: any = {
        storeId: session.storeId,
        userId: session.userId,
        saleNumber: nextSaleNumber,
        subtotal: new Prisma.Decimal(subtotal),
        tax: new Prisma.Decimal(0),
        discountTotal: new Prisma.Decimal(discount),
        totalBeforeDiscount: new Prisma.Decimal(subtotal),
        totalBeforeCoupon: new Prisma.Decimal(subtotal),
        couponDiscount: new Prisma.Decimal(0),
        total: new Prisma.Decimal(saleTotal),
        paymentMethod: paymentMethod as PaymentMethod,
      };

      if (paymentMethod === 'FIADO') {
        saleData.shiftId = null;
        saleData.amountPaid = null;
        saleData.changeAmount = null;
        saleData.customerId = finalCustomerId;
      } else {
        saleData.shiftId = shiftId;
        saleData.amountPaid = amountPaid !== undefined ? new Prisma.Decimal(amountPaid) : null;
        saleData.changeAmount = changeAmount !== null ? new Prisma.Decimal(changeAmount) : null;
        if (finalCustomerId) {
          saleData.customerId = finalCustomerId;
        }
      }

      const sale = await tx.sale.create({ data: saleData });

      // 4. Crear SaleItems
      for (const woItem of workOrder.items) {
        // ✅ SUNAT: Determinar unitSunatCode y unitSymbol
        const product = woItem.storeProduct?.product;
        const isService = woItem.type === 'SERVICE';
        let unitSunatCode: string | null = 'NIU';
        let unitSymbol: string | null = 'und';
        
        if (isService) {
          unitSunatCode = 'ZZ';
          unitSymbol = 'serv';
        } else if (product?.baseUnit?.sunatCode) {
          unitSunatCode = product.baseUnit.sunatCode;
          unitSymbol = product.baseUnit.symbol;
        } else if (product?.unitType === 'KG') {
          unitSunatCode = 'KGM';
          unitSymbol = 'kg';
        }
        
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            storeProductId: woItem.type === 'PRODUCT' ? woItem.storeProductId : null,
            serviceId: woItem.type === 'SERVICE' ? woItem.serviceId : null,
            isService: woItem.type === 'SERVICE',
            productName: woItem.itemName,
            productContent: woItem.itemContent,
            unitType: 'UNIT', // Default, los productos con unidades avanzadas se manejan via conversion
            unitSunatCode, // ✅ SUNAT snapshot
            unitSymbol,    // ✅ SUNAT snapshot
            quantity: woItem.quantityBase,
            unitPrice: woItem.unitPrice,
            subtotal: woItem.subtotal,
            // Campos de conversión (usando campos existentes en schema)
            quantityBase: woItem.quantityBase,
            conversionFactorUsed: woItem.conversionFactor,
            // Sin promociones desde OT
            promotionDiscount: new Prisma.Decimal(0),
            categoryPromoDiscount: new Prisma.Decimal(0),
            volumePromoDiscount: new Prisma.Decimal(0),
            nthPromoDiscount: new Prisma.Decimal(0),
            discountAmount: new Prisma.Decimal(0),
            totalLine: woItem.subtotal,
          },
        });
      }

      // 5. Descontar stock con deltas condicionados y registrar movimientos (solo productos)
      const productItems = workOrder.items.filter((woItem) => woItem.type === 'PRODUCT' && woItem.storeProductId && woItem.storeProduct);
      await consumeSaleInventory(tx, {
        storeId: session.storeId,
        products: productItems.map((woItem) => ({
          storeProductId: woItem.storeProductId!,
          productName: woItem.itemName,
          quantity: woItem.quantityBase,
          tracksStock: woItem.storeProduct!.stock !== null,
        })),
        batches: [],
      });
      for (const woItem of productItems) {
        await tx.movement.create({
          data: {
            storeId: session.storeId,
            storeProductId: woItem.storeProductId!,
            type: 'SALE',
            quantity: woItem.quantityBase.negated(),
            unitPrice: woItem.unitPrice,
            total: woItem.subtotal,
            notes: `Venta #${nextSaleNumber} (OT #${workOrder.orderNumber})`,
            createdById: session.userId,
          },
        });
      }

      // 6. Si es FIADO, crear Receivable
      let receivable = null;
      if (paymentMethod === 'FIADO') {
        receivable = await tx.receivable.create({
          data: {
            storeId: session.storeId,
            customerId: finalCustomerId!,
            saleId: sale.id,
            originalAmount: new Prisma.Decimal(saleTotal),
            balance: new Prisma.Decimal(saleTotal),
            status: 'OPEN',
            createdById: session.userId,
          },
        });
      }

      // 7. Actualizar WorkOrder - marcar como CLOSED y vincular con sale
      const updatedWorkOrder = await tx.workOrder.update({
        where: { id: workOrder.id },
        data: { saleId: sale.id },
      });

      return { sale, receivable, workOrder: updatedWorkOrder };
    });

    return NextResponse.json({
      message: 'Orden convertida a venta exitosamente',
      data: {
        saleId: result.sale.id,
        saleNumber: result.sale.saleNumber,
        workOrderId: result.workOrder.id,
        workOrderNumber: result.workOrder.orderNumber,
        total: result.sale.total,
        paymentMethod: result.sale.paymentMethod,
        receivableId: result.receivable?.id,
      },
    });

  } catch (error: any) {
    if (error instanceof OrderAlreadyChargedError) {
      return NextResponse.json({ error: 'Esta orden ya fue cobrada o cambió de estado' }, { status: 409 });
    }
    if (error instanceof InventoryMutationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error('POST /api/work-orders/[id]/convert-to-sale error:', error);
    if (error.code === 'FEATURE_DISABLED') {
      return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Error al convertir orden' }, { status: 500 });
  }
}
