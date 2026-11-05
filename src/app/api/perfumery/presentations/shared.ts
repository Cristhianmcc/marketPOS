import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { isValidPromo } from '@/lib/perfumery/promo';

export const presentationInclude = {
  container: { select: { id: true, stock: true, active: true, product: { select: { name: true } } } },
} satisfies Prisma.PerfumePresentationInclude;

type PresentationWithContainer = Prisma.PerfumePresentationGetPayload<{ include: typeof presentationInclude }>;

export function serializePresentation(p: PresentationWithContainer) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    essenceMl: p.essenceMl.toNumber(),
    price: p.price.toNumber(),
    listPrice: p.listPrice?.toNumber() ?? null,
    isRefill: p.isRefill,
    requiresPriorPurchase: p.requiresPriorPurchase,
    grantsRefill: p.grantsRefill,
    promoBuy: p.promoBuy,
    promoPay: p.promoPay,
    sortOrder: p.sortOrder,
    active: p.active,
    container: p.container
      ? {
          storeProductId: p.container.id,
          name: p.container.product.name,
          stock: p.container.stock?.toNumber() ?? null,
          active: p.container.active,
        }
      : null,
  };
}

type ParsedPresentation = { data: Record<string, unknown>; error?: never } | { data?: never; error: string };

/** Valida el cuerpo de alta (partial=false) o edición (partial=true). */
export async function parsePresentationInput(input: unknown, storeId: string, partial: boolean): Promise<ParsedPresentation> {
  if (!input || typeof input !== 'object') return { error: 'Datos inválidos' };
  const body = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim().slice(0, 80);
    if (!name) return { error: 'Falta el nombre' };
    data.name = name;
  }
  if (!partial || body.essenceMl !== undefined) {
    const essenceMl = Number(body.essenceMl);
    if (!(essenceMl > 0 && essenceMl <= 5000)) return { error: 'Los ml de fragancia deben estar entre 0 y 5000' };
    data.essenceMl = new Prisma.Decimal(essenceMl);
  }
  if (!partial || body.price !== undefined) {
    const price = Number(body.price);
    if (!(price > 0 && price <= 100000)) return { error: 'Precio inválido' };
    data.price = new Prisma.Decimal(Math.round(price * 100) / 100);
  }
  if (body.listPrice !== undefined) {
    const listPrice = body.listPrice === null || body.listPrice === '' ? null : Number(body.listPrice);
    if (listPrice !== null && !(listPrice > 0 && listPrice <= 100000)) return { error: 'Precio de lista inválido' };
    data.listPrice = listPrice === null ? null : new Prisma.Decimal(Math.round(listPrice * 100) / 100);
  }
  if (body.sku !== undefined) data.sku = body.sku ? String(body.sku).trim().slice(0, 40) : null;
  if (body.isRefill !== undefined) data.isRefill = Boolean(body.isRefill);
  if (body.requiresPriorPurchase !== undefined) data.requiresPriorPurchase = Boolean(body.requiresPriorPurchase);
  if (body.grantsRefill !== undefined) data.grantsRefill = Boolean(body.grantsRefill);
  if (body.promoBuy !== undefined || body.promoPay !== undefined) {
    const blank = (value: unknown) => value === null || value === undefined || value === '' || value === 0;
    if (blank(body.promoBuy) && blank(body.promoPay)) {
      data.promoBuy = null;
      data.promoPay = null;
    } else {
      const buy = Number(body.promoBuy);
      const pay = Number(body.promoPay);
      if (!isValidPromo(buy, pay)) return { error: 'Promo inválida: lleva más de lo que paga (2x1, 3x2)' };
      data.promoBuy = buy;
      data.promoPay = pay;
    }
  }
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) return { error: 'Orden inválido' };
    data.sortOrder = sortOrder;
  }
  if (body.containerStoreProductId !== undefined) {
    const id = body.containerStoreProductId ? String(body.containerStoreProductId) : null;
    if (id) {
      const container = await prisma.storeProduct.findFirst({ where: { id, storeId }, select: { id: true } });
      if (!container) return { error: 'El envase no pertenece a esta tienda' };
    }
    data.containerStoreProductId = id;
  }
  return { data };
}
