import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey, Prisma } from '@prisma/client';

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const QUANTITY_RE = /^\d+(?:\.\d{1,2})?$/;

class ReceiveOrderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type ReceiveItem = {
  itemId: string;
  quantityReceived: number;
  batchNumber: string | null;
  expiryDate: Date | null;
};

function parseReceiveItems(value: unknown): ReceiveItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ReceiveOrderError('Debe especificar items recibidos', 400);
  }

  const seen = new Set<string>();
  const parsed = value.map((raw) => {
    if (!raw || typeof raw !== 'object') {
      throw new ReceiveOrderError('Hay un item de recepción inválido', 400);
    }

    const item = raw as Record<string, unknown>;
    const itemId = typeof item.itemId === 'string' ? item.itemId.trim() : '';
    const quantityText = String(item.quantityReceived ?? '').trim();
    const batchNumber = typeof item.batchNumber === 'string' && item.batchNumber.trim()
      ? item.batchNumber.trim()
      : null;
    const expiryText = typeof item.expiryDate === 'string' && item.expiryDate.trim()
      ? item.expiryDate.trim()
      : null;

    if (!itemId || seen.has(itemId)) {
      throw new ReceiveOrderError('Los items de recepción deben ser únicos y válidos', 400);
    }
    seen.add(itemId);

    if (!QUANTITY_RE.test(quantityText)) {
      throw new ReceiveOrderError('La cantidad recibida debe ser positiva y tener máximo 2 decimales', 400);
    }
    const quantityReceived = Number(quantityText);
    if (!Number.isFinite(quantityReceived) || quantityReceived <= 0 || quantityReceived > 99_999_999) {
      throw new ReceiveOrderError('La cantidad recibida está fuera del rango permitido', 400);
    }
    if ((batchNumber && !expiryText) || (!batchNumber && expiryText)) {
      throw new ReceiveOrderError('El número de lote y la fecha de vencimiento deben registrarse juntos', 400);
    }
    if (batchNumber && batchNumber.length > 100) {
      throw new ReceiveOrderError('El número de lote es demasiado largo', 400);
    }

    let expiryDate: Date | null = null;
    if (expiryText) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryText)) {
        throw new ReceiveOrderError('La fecha de vencimiento no es válida', 400);
      }
      expiryDate = new Date(`${expiryText}T00:00:00.000Z`);
      if (Number.isNaN(expiryDate.getTime())) {
        throw new ReceiveOrderError('La fecha de vencimiento no es válida', 400);
      }
    }

    return { itemId, quantityReceived, batchNumber, expiryDate };
  });

  return parsed.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

function receiptToken(storeId: string, orderId: string, key: string) {
  return createHash('sha256').update(`${storeId}:${orderId}:${key}`).digest('hex').slice(0, 24);
}

function movementId(token: string, index: number) {
  return `por_${token}_${index}`;
}

// PATCH: cambiar estado o recepcionar mercadería.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    if (action === 'receive') {
      const key = req.headers.get('idempotency-key')?.trim() || '';
      if (!IDEMPOTENCY_KEY_RE.test(key)) {
        return NextResponse.json(
          { error: 'Se requiere una clave de idempotencia válida para recepcionar' },
          { status: 400 }
        );
      }

      let receivedItems: ReceiveItem[];
      try {
        receivedItems = parseReceiveItems(body.receivedItems);
      } catch (error) {
        if (error instanceof ReceiveOrderError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }

      const token = receiptToken(user.storeId, id, key);
      const marker = `[receipt:${token}]`;
      const expectedMovementIds = receivedItems.map((_, index) => movementId(token, index));

      const readReplay = async () => {
        const existing = await prisma.movement.findMany({
          where: { storeId: user.storeId!, type: 'PURCHASE', notes: { contains: marker } },
          select: { id: true, storeProductId: true, quantity: true },
          orderBy: { id: 'asc' },
        });
        if (existing.length === 0) return null;

        const expected = receivedItems.map((item, index) => {
          const orderItem = order.items.find((candidate) => candidate.id === item.itemId);
          return {
            id: expectedMovementIds[index],
            storeProductId: orderItem?.storeProductId,
            quantity: item.quantityReceived,
          };
        });
        const exactReplay = existing.length === expected.length && existing.every((movement, index) => (
          movement.id === expected[index].id
          && movement.storeProductId === expected[index].storeProductId
          && movement.quantity.toNumber() === expected[index].quantity
        ));
        if (!exactReplay) {
          throw new ReceiveOrderError('La clave de idempotencia ya fue usada con otra recepción', 409);
        }

        const currentOrder = await prisma.purchaseOrder.findFirst({
          where: { id, storeId: user.storeId! },
        });
        return NextResponse.json({
          message: 'Esta recepción ya había sido registrada.',
          order: currentOrder,
          replayed: true,
        });
      };

      try {
        const replay = await readReplay();
        if (replay) return replay;

        if (order.status === 'CANCELLED' || order.status === 'RECEIVED') {
          return NextResponse.json({ error: 'La orden no puede ser recepcionada' }, { status: 400 });
        }

        const batchExpiryEnabled = await isFeatureEnabled(
          user.storeId,
          FeatureFlagKey.ENABLE_BATCH_EXPIRY
        );

        const result = await prisma.$transaction(async (tx) => {
          // Compara la versión leída antes de modificar stock. Dos recepciones
          // simultáneas no pueden reclamar la misma versión de la orden.
          const claimed = await tx.purchaseOrder.updateMany({
            where: {
              id,
              storeId: user.storeId!,
              updatedAt: order.updatedAt,
              status: { in: ['DRAFT', 'SENT', 'PARTIAL'] },
            },
            data: { updatedAt: new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1)) },
          });
          if (claimed.count !== 1) {
            throw new ReceiveOrderError(
              'La orden cambió mientras se recepcionaba. Actualiza la lista y vuelve a intentarlo.',
              409
            );
          }

          const currentOrder = await tx.purchaseOrder.findFirst({
            where: { id, storeId: user.storeId! },
            include: { items: true },
          });
          if (!currentOrder) throw new ReceiveOrderError('Orden no encontrada', 404);

          const requestedOrderItems = receivedItems.map((received) => {
            const orderItem = currentOrder.items.find((item) => item.id === received.itemId);
            if (!orderItem) {
              throw new ReceiveOrderError('La recepción contiene un item ajeno a la orden', 400);
            }
            const pending = orderItem.quantityOrdered.minus(orderItem.quantityReceived);
            if (pending.lte(0) || new Prisma.Decimal(received.quantityReceived).gt(pending)) {
              throw new ReceiveOrderError(
                `La cantidad recibida supera lo pendiente para el item ${received.itemId}`,
                400
              );
            }
            return { received, orderItem };
          });

          const productIds = requestedOrderItems.map(({ orderItem }) => orderItem.storeProductId);
          const ownedProducts = await tx.storeProduct.findMany({
            where: { id: { in: productIds }, storeId: user.storeId!, active: true },
            select: { id: true },
          });
          const ownedProductIds = new Set(ownedProducts.map((product) => product.id));
          if (ownedProductIds.size !== new Set(productIds).size) {
            throw new ReceiveOrderError('La orden contiene un producto inactivo o de otra tienda', 400);
          }

          let batchesCreated = 0;
          for (const [index, { received, orderItem }] of requestedOrderItems.entries()) {
            let batchId: string | null = null;

            if (batchExpiryEnabled && received.batchNumber && received.expiryDate) {
              const batch = await tx.productBatch.upsert({
                where: {
                  storeId_storeProductId_batchNumber_expiryDate: {
                    storeId: user.storeId!,
                    storeProductId: orderItem.storeProductId,
                    batchNumber: received.batchNumber,
                    expiryDate: received.expiryDate,
                  },
                },
                create: {
                  storeId: user.storeId!,
                  storeProductId: orderItem.storeProductId,
                  batchNumber: received.batchNumber,
                  expiryDate: received.expiryDate,
                  purchaseDate: new Date(),
                  quantityInitial: received.quantityReceived,
                  quantityAvailable: received.quantityReceived,
                  unitCost: orderItem.unitCost,
                  notes: `OC #${currentOrder.orderNumber}`,
                },
                update: {
                  quantityInitial: { increment: received.quantityReceived },
                  quantityAvailable: { increment: received.quantityReceived },
                  unitCost: orderItem.unitCost,
                  active: true,
                },
              });
              batchId = batch.id;
              batchesCreated += 1;
            }

            await tx.purchaseOrderItem.update({
              where: { id: orderItem.id },
              data: {
                quantityReceived: { increment: received.quantityReceived },
                batchNumber: received.batchNumber,
                expiryDate: received.expiryDate,
              },
            });

            await tx.storeProduct.update({
              where: { id: orderItem.storeProductId },
              data: {
                stock: { increment: received.quantityReceived },
                costPrice: orderItem.unitCost,
              },
            });

            await tx.movement.create({
              data: {
                id: expectedMovementIds[index],
                storeId: user.storeId!,
                storeProductId: orderItem.storeProductId,
                type: 'PURCHASE',
                quantity: new Prisma.Decimal(received.quantityReceived),
                unitPrice: orderItem.unitCost,
                total: new Prisma.Decimal(received.quantityReceived).mul(orderItem.unitCost),
                notes: `Recepción OC #${currentOrder.orderNumber} ${marker}`,
                createdById: user.userId,
                batchId,
              },
            });
          }

          const updatedItems = await tx.purchaseOrderItem.findMany({
            where: { purchaseOrderId: id },
          });
          const allReceived = updatedItems.every((item) => item.quantityReceived.gte(item.quantityOrdered));
          const someReceived = updatedItems.some((item) => item.quantityReceived.gt(0));
          const newStatus = allReceived ? 'RECEIVED' : someReceived ? 'PARTIAL' : currentOrder.status;

          const updatedOrder = await tx.purchaseOrder.update({
            where: { id },
            data: {
              status: newStatus,
              ...(allReceived ? { receivedAt: new Date() } : {}),
            },
          });

          return { order: updatedOrder, batchesCreated };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        return NextResponse.json({
          message: `Recepción completada. ${result.batchesCreated} lotes registrados.`,
          order: result.order,
          replayed: false,
        });
      } catch (error) {
        // Si una petición idéntica ganó la carrera, la segunda respuesta debe
        // confirmar el resultado ya guardado en lugar de duplicar el stock.
        const replay = await readReplay();
        if (replay) return replay;
        if (error instanceof ReceiveOrderError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if ((error as { code?: string })?.code === 'P2034') {
          return NextResponse.json(
            { error: 'Otra operación modificó la orden. Actualiza la lista y vuelve a intentarlo.' },
            { status: 409 }
          );
        }
        throw error;
      }
    }

    const { status, notes } = body;
    if (status === 'CANCELLED' && order.status !== 'DRAFT' && order.status !== 'SENT') {
      return NextResponse.json(
        { error: 'Solo se pueden cancelar órdenes en borrador o enviadas' },
        { status: 400 }
      );
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
