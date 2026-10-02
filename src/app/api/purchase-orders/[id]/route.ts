import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey, Prisma } from '@prisma/client';

// PATCH: Actualizar orden (cambiar estado, editar)
// POST con action=receive: Recepcionar mercadería → crea lotes automáticamente
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_SUPPLIERS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    const order = await prisma.purchaseOrder.findFirst({
      where: { id, storeId: user.storeId },
      include: { items: true },
    });
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

    // ═══════════ RECEPCIÓN DE MERCADERÍA ═══════════
    if (action === 'receive') {
      if (order.status === 'CANCELLED' || order.status === 'RECEIVED') {
        return NextResponse.json({ error: 'La orden no puede ser recepcionada' }, { status: 400 });
      }

      const { receivedItems } = body;
      // receivedItems: [{ itemId, quantityReceived, batchNumber, expiryDate }]
      if (!receivedItems?.length) {
        return NextResponse.json({ error: 'Debe especificar items recibidos' }, { status: 400 });
      }

      const batchExpiryEnabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);

      // Transacción: actualizar items + crear lotes + crear movimientos + actualizar stock
      const result = await prisma.$transaction(async (tx) => {
        const batchesCreated = [];

        for (const ri of receivedItems) {
          const orderItem = order.items.find((i) => i.id === ri.itemId);
          if (!orderItem) continue;

          const qtyReceived = parseFloat(ri.quantityReceived) || 0;
          if (qtyReceived <= 0) continue;

          // Actualizar cantidad recibida en el item
          await tx.purchaseOrderItem.update({
            where: { id: ri.itemId },
            data: {
              quantityReceived: { increment: qtyReceived },
              batchNumber: ri.batchNumber || null,
              expiryDate: ri.expiryDate ? new Date(ri.expiryDate) : null,
            },
          });

          // Crear lote automáticamente si batch expiry está habilitado
          if (batchExpiryEnabled && ri.batchNumber && ri.expiryDate) {
            const batch = await tx.productBatch.create({
              data: {
                storeId: user.storeId!,
                storeProductId: orderItem.storeProductId,
                batchNumber: ri.batchNumber,
                expiryDate: new Date(ri.expiryDate),
                purchaseDate: new Date(),
                quantityInitial: qtyReceived,
                quantityAvailable: qtyReceived,
                unitCost: orderItem.unitCost,
                notes: `OC #${order.orderNumber}`,
              },
            });
            batchesCreated.push(batch);
          }

          // Actualizar stock del producto
          await tx.storeProduct.update({
            where: { id: orderItem.storeProductId },
            data: { stock: { increment: qtyReceived } },
          });

          // Crear movimiento de compra
          await tx.movement.create({
            data: {
              storeId: user.storeId!,
              storeProductId: orderItem.storeProductId,
              type: 'PURCHASE',
              quantity: new Prisma.Decimal(qtyReceived),
              unitPrice: orderItem.unitCost,
              total: new Prisma.Decimal(qtyReceived).mul(orderItem.unitCost),
              notes: `Recepción OC #${order.orderNumber}`,
              createdById: user.userId,
              batchId: batchesCreated.length > 0 ? batchesCreated[batchesCreated.length - 1].id : null,
            },
          });

          // Actualizar costPrice del producto con el último costo
          await tx.storeProduct.update({
            where: { id: orderItem.storeProductId },
            data: { costPrice: orderItem.unitCost },
          });
        }

        // Determinar estado de la orden
        const updatedItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: id },
        });
        const allReceived = updatedItems.every(
          (i) => i.quantityReceived.toNumber() >= i.quantityOrdered.toNumber()
        );
        const someReceived = updatedItems.some(
          (i) => i.quantityReceived.toNumber() > 0
        );

        const newStatus = allReceived ? 'RECEIVED' : someReceived ? 'PARTIAL' : order.status;

        const updatedOrder = await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: newStatus,
            ...(allReceived ? { receivedAt: new Date() } : {}),
          },
        });

        return { order: updatedOrder, batchesCreated: batchesCreated.length };
      });

      return NextResponse.json({
        message: `Recepción completada. ${result.batchesCreated} lotes creados.`,
        order: result.order,
      });
    }

    // ═══════════ CAMBIO DE ESTADO SIMPLE ═══════════
    const { status, notes } = body;
    if (status === 'CANCELLED' && order.status !== 'DRAFT' && order.status !== 'SENT') {
      return NextResponse.json({ error: 'Solo se pueden cancelar órdenes en borrador o enviadas' }, { status: 400 });
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error('Error updating purchase order:', error);
    return NextResponse.json({ error: 'Error al actualizar orden de compra' }, { status: 500 });
  }
}
