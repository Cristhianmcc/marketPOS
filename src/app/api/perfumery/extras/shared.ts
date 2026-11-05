import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';

const stockProductSelect = {
  select: { id: true, stock: true, active: true, product: { select: { name: true } } },
} as const;

export const extraInclude = { storeProduct: stockProductSelect } satisfies Prisma.PerfumeExtraInclude;
export const packInclude = { gift: stockProductSelect } satisfies Prisma.PerfumePackInclude;

type StockProduct = { id: string; stock: Prisma.Decimal | null; active: boolean; product: { name: string } } | null;

const serializeStockProduct = (sp: StockProduct) =>
  sp ? { storeProductId: sp.id, name: sp.product.name, stock: sp.stock?.toNumber() ?? null, active: sp.active } : null;

export function serializeExtra(e: Prisma.PerfumeExtraGetPayload<{ include: typeof extraInclude }>) {
  return {
    id: e.id,
    name: e.name,
    price: e.price.toNumber(),
    extraEssenceMl: e.extraEssenceMl?.toNumber() ?? null,
    productQty: e.productQty.toNumber(),
    product: serializeStockProduct(e.storeProduct),
    sortOrder: e.sortOrder,
    active: e.active,
  };
}

export function serializePack(p: Prisma.PerfumePackGetPayload<{ include: typeof packInclude }>) {
  return {
    id: p.id,
    name: p.name,
    essenceMl: p.essenceMl.toNumber(),
    fragranceCount: p.fragranceCount,
    price: p.price.toNumber(),
    listPrice: p.listPrice?.toNumber() ?? null,
    gift: serializeStockProduct(p.gift),
    sortOrder: p.sortOrder,
    active: p.active,
  };
}

type Parsed = { data: Record<string, unknown>; error?: never } | { data?: never; error: string };

const money = (value: unknown, allowZero = false): number | null => {
  const number = Number(value);
  if (!Number.isFinite(number) || number > 100000 || number < 0 || (!allowZero && number === 0)) return null;
  return Math.round(number * 100) / 100;
};

async function storeProductOfStore(id: unknown, storeId: string): Promise<string | null | 'invalid'> {
  if (id === null || id === '' || id === undefined) return null;
  const found = await prisma.storeProduct.findFirst({ where: { id: String(id), storeId }, select: { id: true } });
  return found ? found.id : 'invalid';
}

function common(body: Record<string, unknown>, data: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim().slice(0, 80);
    if (!name) return 'Falta el nombre';
    data.name = name;
  }
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) return 'Orden inválido';
    data.sortOrder = sortOrder;
  }
  return null;
}

/** Extra: precio + (ml extra de la fragancia | producto que descuenta). */
export async function parseExtraInput(
  input: unknown,
  storeId: string,
  current: { extraEssenceMl: number | null; storeProductId: string | null } | null
): Promise<Parsed> {
  if (!input || typeof input !== 'object') return { error: 'Datos inválidos' };
  const body = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const partial = current !== null;
  const commonError = common(body, data, partial);
  if (commonError) return { error: commonError };

  if (!partial || body.price !== undefined) {
    const price = money(body.price, true);
    if (price === null) return { error: 'Precio inválido' };
    data.price = new Prisma.Decimal(price);
  }
  let extraEssenceMl = current?.extraEssenceMl ?? null;
  let storeProductId = current?.storeProductId ?? null;
  if (body.extraEssenceMl !== undefined) {
    const ml = body.extraEssenceMl === null || body.extraEssenceMl === '' ? null : Number(body.extraEssenceMl);
    if (ml !== null && !(ml > 0 && ml <= 1000)) return { error: 'ml extra inválidos' };
    extraEssenceMl = ml;
    data.extraEssenceMl = ml === null ? null : new Prisma.Decimal(ml);
  }
  if (body.storeProductId !== undefined) {
    const id = await storeProductOfStore(body.storeProductId, storeId);
    if (id === 'invalid') return { error: 'El producto no pertenece a esta tienda' };
    storeProductId = id;
    data.storeProductId = id;
  }
  if (body.productQty !== undefined) {
    const qty = Number(body.productQty);
    if (!(qty > 0 && qty <= 1000)) return { error: 'Cantidad del producto inválida' };
    data.productQty = new Prisma.Decimal(qty);
  }
  if (Boolean(extraEssenceMl) === Boolean(storeProductId)) {
    return { error: 'Indica ml extra de la fragancia o un producto (uno de los dos)' };
  }
  return { data };
}

/** Pack: tamaño del frasco, cantidad de fragancias, precio cerrado y regalo. */
export async function parsePackInput(input: unknown, storeId: string, partial: boolean): Promise<Parsed> {
  if (!input || typeof input !== 'object') return { error: 'Datos inválidos' };
  const body = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const commonError = common(body, data, partial);
  if (commonError) return { error: commonError };

  if (!partial || body.essenceMl !== undefined) {
    const ml = Number(body.essenceMl);
    if (!(ml > 0 && ml <= 5000)) return { error: 'ml del frasco inválidos' };
    data.essenceMl = new Prisma.Decimal(ml);
  }
  if (!partial || body.fragranceCount !== undefined) {
    const count = Number(body.fragranceCount);
    if (!(Number.isInteger(count) && count >= 2 && count <= 10)) return { error: 'El pack lleva de 2 a 10 fragancias' };
    data.fragranceCount = count;
  }
  if (!partial || body.price !== undefined) {
    const price = money(body.price);
    if (price === null) return { error: 'Precio inválido' };
    data.price = new Prisma.Decimal(price);
  }
  if (body.listPrice !== undefined) {
    const listPrice = body.listPrice === null || body.listPrice === '' ? null : money(body.listPrice);
    if (body.listPrice !== null && body.listPrice !== '' && listPrice === null) return { error: 'Precio de lista inválido' };
    data.listPrice = listPrice === null ? null : new Prisma.Decimal(listPrice);
  }
  if (body.giftStoreProductId !== undefined) {
    const id = await storeProductOfStore(body.giftStoreProductId, storeId);
    if (id === 'invalid') return { error: 'El regalo no pertenece a esta tienda' };
    data.giftStoreProductId = id;
  }
  return { data };
}

/** Productos por unidad de la sede para elegir feromona o regalo (sin esencias). */
export async function listStockProducts(storeId: string) {
  const products = await prisma.storeProduct.findMany({
    where: { storeId, active: true, fragrance: null },
    select: { id: true, stock: true, product: { select: { name: true } } },
    orderBy: { product: { name: 'asc' } },
    take: 1000,
  });
  return products.map((p) => ({ storeProductId: p.id, name: p.product.name, stock: p.stock?.toNumber() ?? null }));
}
