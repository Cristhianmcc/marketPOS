import { Prisma } from '@prisma/client';

export class InventoryMutationError extends Error {
  constructor(
    public code: 'INSUFFICIENT_STOCK' | 'INSUFFICIENT_BATCH_STOCK' | 'STOCK_CONFLICT',
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'InventoryMutationError';
  }
}

export interface SaleStockConsumption {
  storeProductId: string;
  productName: string;
  quantity: Prisma.Decimal.Value;
  tracksStock: boolean;
}

export interface SaleBatchConsumption {
  storeProductId: string;
  batchId: string;
  batchNumber: string;
  quantity: Prisma.Decimal.Value;
}

/** Applies guarded atomic decrements in stable lock order. */
export async function consumeSaleInventory(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    products: SaleStockConsumption[];
    batches: SaleBatchConsumption[];
  }
): Promise<void> {
  const productTotals = new Map<string, {
    productName: string;
    quantity: Prisma.Decimal;
    tracksStock: boolean;
  }>();

  for (const product of input.products) {
    const quantity = new Prisma.Decimal(product.quantity);
    const current = productTotals.get(product.storeProductId);
    productTotals.set(product.storeProductId, {
      productName: product.productName,
      quantity: current ? current.quantity.plus(quantity) : quantity,
      tracksStock: product.tracksStock,
    });
  }

  const batchTotals = new Map<string, {
    storeProductId: string;
    batchNumber: string;
    quantity: Prisma.Decimal;
  }>();

  for (const batch of input.batches) {
    const quantity = new Prisma.Decimal(batch.quantity);
    const current = batchTotals.get(batch.batchId);
    batchTotals.set(batch.batchId, {
      storeProductId: batch.storeProductId,
      batchNumber: batch.batchNumber,
      quantity: current ? current.quantity.plus(quantity) : quantity,
    });
  }

  for (const [storeProductId, product] of [...productTotals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!product.tracksStock) continue;

    const updated = await tx.storeProduct.updateMany({
      where: {
        id: storeProductId,
        storeId: input.storeId,
        active: true,
        stock: { gte: product.quantity },
      },
      data: { stock: { decrement: product.quantity } },
    });

    if (updated.count !== 1) {
      throw new InventoryMutationError(
        'INSUFFICIENT_STOCK',
        `${product.productName}: el stock cambió durante la venta o ya no es suficiente`,
        { storeProductId, requested: product.quantity.toString() }
      );
    }
  }

  for (const [batchId, batch] of [...batchTotals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const updated = await tx.productBatch.updateMany({
      where: {
        id: batchId,
        storeId: input.storeId,
        storeProductId: batch.storeProductId,
        active: true,
        quantityAvailable: { gte: batch.quantity },
      },
      data: { quantityAvailable: { decrement: batch.quantity } },
    });

    if (updated.count !== 1) {
      throw new InventoryMutationError(
        'INSUFFICIENT_BATCH_STOCK',
        `El lote ${batch.batchNumber} cambió durante la venta o ya no tiene stock suficiente`,
        { batchId, storeProductId: batch.storeProductId, requested: batch.quantity.toString() }
      );
    }
  }
}

/** Applies a manual stock delta; movement creation belongs to the same transaction. */
export async function adjustStockAtomically(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    storeProductId: string;
    quantity: Prisma.Decimal.Value;
  }
): Promise<void> {
  const quantity = new Prisma.Decimal(input.quantity);
  const absolute = quantity.abs();
  const updated = await tx.storeProduct.updateMany({
    where: {
      id: input.storeProductId,
      storeId: input.storeId,
      active: true,
      ...(quantity.isNegative() ? { stock: { gte: absolute } } : { stock: { not: null } }),
    },
    data: {
      stock: quantity.isNegative()
        ? { decrement: absolute }
        : { increment: quantity },
    },
  });

  if (updated.count !== 1) {
    throw new InventoryMutationError(
      quantity.isNegative() ? 'INSUFFICIENT_STOCK' : 'STOCK_CONFLICT',
      quantity.isNegative()
        ? 'Stock insuficiente para aplicar el ajuste'
        : 'El producto no controla stock o cambió durante el ajuste',
      { storeProductId: input.storeProductId, quantity: quantity.toString() }
    );
  }
}
