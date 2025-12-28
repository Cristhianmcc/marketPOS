// lib/operationalLimits.ts
// ✅ MÓDULO 15 - FASE 3: Límites Operativos
// Helper centralizado para validar límites operativos por tienda

import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';

/**
 * Error personalizado para límites excedidos
 */
export class LimitExceededError extends Error {
  code = 'LIMIT_EXCEEDED';
  statusCode = 403;
  details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'LimitExceededError';
    this.details = details;
  }
}

/**
 * Interfaz para límites operativos
 */
export interface OperationalLimits {
  maxDiscountPercent: number | null;
  maxManualDiscountAmount: number | null;
  maxSaleTotal: number | null;
  maxItemsPerSale: number | null;
  maxReceivableBalance: number | null;
}

/**
 * Obtiene los límites operativos de una tienda
 * @param storeId - ID de la tienda
 * @returns Límites operativos (null = sin límite)
 */
export async function getOperationalLimits(storeId: string): Promise<OperationalLimits> {
  const limits = await prisma.operationalLimit.findUnique({
    where: { storeId },
  });

  if (!limits) {
    // Si no existen límites, retornar todo null (sin restricciones)
    return {
      maxDiscountPercent: null,
      maxManualDiscountAmount: null,
      maxSaleTotal: null,
      maxItemsPerSale: null,
      maxReceivableBalance: null,
    };
  }

  return {
    maxDiscountPercent: limits.maxDiscountPercent ? Number(limits.maxDiscountPercent) : null,
    maxManualDiscountAmount: limits.maxManualDiscountAmount ? Number(limits.maxManualDiscountAmount) : null,
    maxSaleTotal: limits.maxSaleTotal ? Number(limits.maxSaleTotal) : null,
    maxItemsPerSale: limits.maxItemsPerSale,
    maxReceivableBalance: limits.maxReceivableBalance ? Number(limits.maxReceivableBalance) : null,
  };
}

/**
 * Valida que un porcentaje de descuento no exceda el límite
 * @param storeId - ID de la tienda
 * @param percent - Porcentaje de descuento a validar
 * @throws LimitExceededError si excede el límite
 */
export async function validateDiscountPercent(
  storeId: string,
  percent: number
): Promise<void> {
  const limits = await getOperationalLimits(storeId);
  
  if (limits.maxDiscountPercent === null) {
    return; // Sin límite configurado
  }

  if (percent > limits.maxDiscountPercent) {
    throw new LimitExceededError(
      `El descuento porcentual (${percent}%) excede el límite permitido (${limits.maxDiscountPercent}%)`,
      {
        limit: limits.maxDiscountPercent,
        attempted: percent,
      }
    );
  }
}

/**
 * Valida que un monto de descuento manual no exceda el límite
 * @param storeId - ID de la tienda
 * @param amount - Monto de descuento a validar
 * @throws LimitExceededError si excede el límite
 */
export async function validateManualDiscountAmount(
  storeId: string,
  amount: number
): Promise<void> {
  const limits = await getOperationalLimits(storeId);
  
  if (limits.maxManualDiscountAmount === null) {
    return; // Sin límite configurado
  }

  if (amount > limits.maxManualDiscountAmount) {
    throw new LimitExceededError(
      `El descuento manual (S/ ${amount.toFixed(2)}) excede el límite permitido (S/ ${limits.maxManualDiscountAmount.toFixed(2)})`,
      {
        limit: limits.maxManualDiscountAmount,
        attempted: amount,
      }
    );
  }
}

/**
 * Valida que el total de una venta no exceda el límite
 * @param storeId - ID de la tienda
 * @param total - Total de la venta
 * @throws LimitExceededError si excede el límite
 */
export async function validateSaleTotal(
  storeId: string,
  total: number
): Promise<void> {
  const limits = await getOperationalLimits(storeId);
  
  if (limits.maxSaleTotal === null) {
    return; // Sin límite configurado
  }

  if (total > limits.maxSaleTotal) {
    throw new LimitExceededError(
      `El total de la venta (S/ ${total.toFixed(2)}) excede el límite permitido (S/ ${limits.maxSaleTotal.toFixed(2)})`,
      {
        limit: limits.maxSaleTotal,
        attempted: total,
      }
    );
  }
}

/**
 * Valida que la cantidad de ítems en una venta no exceda el límite
 * @param storeId - ID de la tienda
 * @param count - Cantidad de ítems
 * @throws LimitExceededError si excede el límite
 */
export async function validateItemsCount(
  storeId: string,
  count: number
): Promise<void> {
  const limits = await getOperationalLimits(storeId);
  
  if (limits.maxItemsPerSale === null) {
    return; // Sin límite configurado
  }

  if (count > limits.maxItemsPerSale) {
    throw new LimitExceededError(
      `La cantidad de ítems (${count}) excede el límite permitido (${limits.maxItemsPerSale})`,
      {
        limit: limits.maxItemsPerSale,
        attempted: count,
      }
    );
  }
}

/**
 * Valida que el balance de cuentas por cobrar de un cliente no exceda el límite
 * @param storeId - ID de la tienda
 * @param customerId - ID del cliente
 * @param newAmount - Nuevo monto a agregar
 * @throws LimitExceededError si excede el límite
 */
export async function validateReceivableBalance(
  storeId: string,
  customerId: string,
  newAmount: number
): Promise<void> {
  const limits = await getOperationalLimits(storeId);
  
  if (limits.maxReceivableBalance === null) {
    return; // Sin límite configurado
  }

  // Calcular balance actual del cliente (OPEN receivables)
  const receivables = await prisma.receivable.findMany({
    where: {
      storeId,
      customerId,
      status: 'OPEN',
    },
    select: {
      balance: true,
    },
  });

  const currentBalance = receivables.reduce((sum, r) => sum + Number(r.balance), 0);
  const newBalance = currentBalance + newAmount;

  if (newBalance > limits.maxReceivableBalance) {
    throw new LimitExceededError(
      `El balance de cuentas por cobrar (S/ ${newBalance.toFixed(2)}) excede el límite permitido (S/ ${limits.maxReceivableBalance.toFixed(2)})`,
      {
        limit: limits.maxReceivableBalance,
        attempted: newBalance,
        currentBalance,
        newAmount,
      }
    );
  }
}

/**
 * Actualiza los límites operativos de una tienda
 * @param storeId - ID de la tienda
 * @param limits - Nuevos límites (null = sin límite)
 * @returns Límites actualizados
 */
export async function setOperationalLimits(
  storeId: string,
  limits: Partial<OperationalLimits>
) {
  // Convertir null/undefined a Decimal o dejar como null
  const data: any = {};
  
  if (limits.maxDiscountPercent !== undefined) {
    data.maxDiscountPercent = limits.maxDiscountPercent !== null 
      ? new Prisma.Decimal(limits.maxDiscountPercent) 
      : null;
  }
  
  if (limits.maxManualDiscountAmount !== undefined) {
    data.maxManualDiscountAmount = limits.maxManualDiscountAmount !== null
      ? new Prisma.Decimal(limits.maxManualDiscountAmount)
      : null;
  }
  
  if (limits.maxSaleTotal !== undefined) {
    data.maxSaleTotal = limits.maxSaleTotal !== null
      ? new Prisma.Decimal(limits.maxSaleTotal)
      : null;
  }
  
  if (limits.maxItemsPerSale !== undefined) {
    data.maxItemsPerSale = limits.maxItemsPerSale;
  }
  
  if (limits.maxReceivableBalance !== undefined) {
    data.maxReceivableBalance = limits.maxReceivableBalance !== null
      ? new Prisma.Decimal(limits.maxReceivableBalance)
      : null;
  }

  const updated = await prisma.operationalLimit.upsert({
    where: { storeId },
    create: {
      storeId,
      ...data,
    },
    update: data,
  });

  return updated;
}
