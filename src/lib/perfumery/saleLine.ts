/**
 * Perfumería: cálculo de una línea "fragancia + presentación (+ extras)".
 *
 * La línea se guarda como venta de la esencia (StoreProduct en ml):
 * - quantity        = ml descontados (unidad base, como el resto del POS)
 * - quantityOriginal = frascos vendidos
 * - pricingMode SELL_UNIT_OVERRIDE + sellUnitPriceApplied = precio del frasco
 *
 * Así el ticket, el PDF y SUNAT informan "2 × S/ 53.94" (ver
 * `src/lib/sunat/saleLineQuantity.ts`) aunque el inventario descuente ml.
 * El envase, los extras con producto (feromonas) y el regalo de un pack se
 * descuentan aparte y quedan en `perfumeDetail` para que la anulación los
 * devuelva.
 */

export interface PerfumeLineExtraInput {
  id: string;
  name: string;
  price: number;
  /** ml extra de la misma fragancia por frasco ("5 g adicionales"). */
  extraEssenceMl: number | null;
  /** Producto que descuenta por frasco (feromona), con su cantidad. */
  product: { storeProductId: string; name: string; costPrice: number | null } | null;
  productQty: number;
}

export interface PerfumeLinePackInput {
  id: string;
  name: string;
  /** Agrupa las líneas de un mismo pack vendido. */
  groupId: string;
  index: number;
  count: number;
  /** Precio de este frasco dentro del pack (prorrateo del precio del pack). */
  bottlePrice: number;
  gift: { storeProductId: string; name: string; costPrice: number | null } | null;
}

export interface PerfumeLineInput {
  bottles: number;
  fragrance: { code: string; productName: string };
  presentation: {
    id: string;
    name: string;
    essenceMl: number;
    price: number;
    isRefill: boolean;
    grantsRefill?: boolean;
  };
  essenceCostPerMl: number | null;
  container: { storeProductId: string; name: string; costPrice: number | null } | null;
  extras?: PerfumeLineExtraInput[];
  pack?: PerfumeLinePackInput | null;
}

export type PerfumeStockUseKind = 'EXTRA' | 'GIFT';

export interface PerfumeStockUse {
  storeProductId: string;
  name: string;
  quantity: number;
  kind: PerfumeStockUseKind;
}

export interface PerfumeDetailSnapshot {
  fragranceCode: string;
  presentationId: string;
  presentationName: string;
  isRefill: boolean;
  grantsRefill: boolean;
  /** ml por frasco, extras incluidos. */
  essenceMlPerUnit: number;
  bottles: number;
  containerStoreProductId: string | null;
  containerName: string | null;
  containerQty: number;
  extras: Array<{ id: string; name: string; price: number; extraEssenceMl: number | null; storeProductId: string | null; productQty: number }>;
  pack: { id: string; name: string; groupId: string; index: number; count: number } | null;
  /** Otros productos descontados (extras con producto, regalo del pack). */
  stockUses: PerfumeStockUse[];
  promoName: string | null;
  refillOverride: boolean;
  /** Costo total de la línea (esencia, envase, extras y regalo); null sin costos. */
  costTotal: number | null;
}

export interface PerfumeLine {
  /** ml de esencia a descontar. */
  essenceMl: number;
  /** Precio del frasco: presentación + extras, o la parte del pack. */
  bottlePrice: number;
  /** Precio por ml (referencial: el importe real es bottles × bottlePrice). */
  unitPricePerMl: number;
  subtotal: number;
  /** Costo por ml que incluye envase, extras y regalo; null si no hay costos. */
  costPerMl: number | null;
  productName: string;
  detail: PerfumeDetailSnapshot;
}

export class PerfumeLineError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PerfumeLineError';
  }
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function buildPerfumeLine(input: PerfumeLineInput): PerfumeLine {
  const { bottles, presentation, fragrance, container } = input;
  const extras = input.extras ?? [];
  const pack = input.pack ?? null;
  if (!Number.isInteger(bottles) || bottles <= 0) {
    throw new PerfumeLineError('INVALID_QUANTITY', 'La cantidad de frascos debe ser un entero mayor a 0');
  }
  if (!(presentation.essenceMl > 0)) {
    throw new PerfumeLineError('INVALID_PRESENTATION', `${presentation.name}: los ml de fragancia deben ser mayores a 0`);
  }
  if (!(presentation.price > 0)) {
    throw new PerfumeLineError('INVALID_PRESENTATION', `${presentation.name}: el precio debe ser mayor a 0`);
  }
  if (pack && extras.length) {
    throw new PerfumeLineError('PACK_EXTRAS', `${pack.name}: los extras se venden aparte del pack`);
  }

  const extraMl = extras.reduce((sum, extra) => sum + (extra.extraEssenceMl ?? 0), 0);
  const essenceMlPerUnit = round(presentation.essenceMl + extraMl, 3);
  const bottlePrice = pack
    ? round(pack.bottlePrice, 2)
    : round(presentation.price + extras.reduce((sum, extra) => sum + extra.price, 0), 2);
  if (!(bottlePrice > 0)) {
    throw new PerfumeLineError('INVALID_PRICE', `${presentation.name}: el precio debe ser mayor a 0`);
  }
  const essenceMl = round(bottles * essenceMlPerUnit, 3);
  const subtotal = round(bottles * bottlePrice, 2);

  const stockUses: PerfumeStockUse[] = [];
  for (const extra of extras) {
    if (extra.product && extra.productQty > 0) {
      stockUses.push({
        storeProductId: extra.product.storeProductId,
        name: extra.product.name,
        quantity: round(extra.productQty * bottles, 3),
        kind: 'EXTRA',
      });
    }
  }
  // El regalo va una vez por pack vendido, en su primera línea.
  if (pack?.gift && pack.index === 0) {
    stockUses.push({ storeProductId: pack.gift.storeProductId, name: pack.gift.name, quantity: bottles, kind: 'GIFT' });
  }

  const costs = [
    input.essenceCostPerMl,
    container?.costPrice ?? null,
    ...extras.map((extra) => extra.product?.costPrice ?? null),
    pack?.index === 0 ? pack.gift?.costPrice ?? null : null,
  ];
  let costPerMl: number | null = null;
  let costTotal: number | null = null;
  if (costs.some((cost) => cost !== null)) {
    const perBottle = (input.essenceCostPerMl ?? 0) * essenceMlPerUnit
      + (container?.costPrice ?? 0)
      + extras.reduce((sum, extra) => sum + (extra.product?.costPrice ?? 0) * extra.productQty, 0)
      + (pack?.index === 0 ? pack.gift?.costPrice ?? 0 : 0);
    costPerMl = round(perBottle / essenceMlPerUnit, 2);
    costTotal = round(perBottle * bottles, 2);
  }

  const extrasLabel = extras.length ? ` + ${extras.map((extra) => extra.name).join(' + ')}` : '';
  const packLabel = pack ? ` (${pack.name})` : '';

  return {
    essenceMl,
    bottlePrice,
    unitPricePerMl: round(bottlePrice / essenceMlPerUnit, 2),
    subtotal,
    costPerMl,
    productName: `${fragrance.productName} - ${presentation.name}${extrasLabel}${packLabel}`,
    detail: {
      fragranceCode: fragrance.code,
      presentationId: presentation.id,
      presentationName: presentation.name,
      isRefill: presentation.isRefill,
      grantsRefill: Boolean(presentation.grantsRefill),
      essenceMlPerUnit,
      bottles,
      containerStoreProductId: container?.storeProductId ?? null,
      containerName: container?.name ?? null,
      containerQty: container ? bottles : 0,
      extras: extras.map((extra) => ({
        id: extra.id,
        name: extra.name,
        price: extra.price,
        extraEssenceMl: extra.extraEssenceMl,
        storeProductId: extra.product?.storeProductId ?? null,
        productQty: extra.productQty,
      })),
      pack: pack ? { id: pack.id, name: pack.name, groupId: pack.groupId, index: pack.index, count: pack.count } : null,
      stockUses,
      promoName: null,
      refillOverride: false,
      costTotal,
    },
  };
}

/**
 * Reparte el precio cerrado de un pack entre sus frascos (centavos exactos:
 * la diferencia de redondeo va al último).
 */
export function splitPackPrice(price: number, count: number): number[] {
  const cents = Math.round(price * 100);
  const base = Math.floor(cents / count);
  return Array.from({ length: count }, (_, index) =>
    (index === count - 1 ? cents - base * (count - 1) : base) / 100
  );
}

/** Lee el snapshot guardado en SaleItem.perfumeDetail (JSON). */
export function readPerfumeDetail(value: unknown): PerfumeDetailSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const detail = value as Partial<PerfumeDetailSnapshot>;
  if (typeof detail.presentationId !== 'string' || typeof detail.fragranceCode !== 'string') return null;
  const stockUses = Array.isArray(detail.stockUses)
    ? detail.stockUses
        .filter((use) => use && typeof use.storeProductId === 'string' && Number(use.quantity) > 0)
        .map((use) => ({
          storeProductId: use.storeProductId,
          name: String(use.name ?? ''),
          quantity: Number(use.quantity),
          kind: (use.kind === 'GIFT' ? 'GIFT' : 'EXTRA') as PerfumeStockUseKind,
        }))
    : [];
  const pack = detail.pack && typeof detail.pack === 'object' && typeof detail.pack.id === 'string'
    ? {
        id: detail.pack.id,
        name: String(detail.pack.name ?? ''),
        groupId: String(detail.pack.groupId ?? ''),
        index: Number(detail.pack.index ?? 0),
        count: Number(detail.pack.count ?? 0),
      }
    : null;
  return {
    fragranceCode: detail.fragranceCode,
    presentationId: detail.presentationId,
    presentationName: String(detail.presentationName ?? ''),
    isRefill: Boolean(detail.isRefill),
    grantsRefill: Boolean(detail.grantsRefill),
    essenceMlPerUnit: Number(detail.essenceMlPerUnit ?? 0),
    bottles: Number(detail.bottles ?? 0),
    containerStoreProductId: typeof detail.containerStoreProductId === 'string' ? detail.containerStoreProductId : null,
    containerName: typeof detail.containerName === 'string' ? detail.containerName : null,
    containerQty: Number(detail.containerQty ?? 0),
    extras: Array.isArray(detail.extras)
      ? detail.extras.map((extra) => ({
          id: String(extra?.id ?? ''),
          name: String(extra?.name ?? ''),
          price: Number(extra?.price ?? 0),
          extraEssenceMl: extra?.extraEssenceMl != null ? Number(extra.extraEssenceMl) : null,
          storeProductId: typeof extra?.storeProductId === 'string' ? extra.storeProductId : null,
          productQty: Number(extra?.productQty ?? 0),
        }))
      : [],
    pack,
    stockUses,
    promoName: typeof detail.promoName === 'string' ? detail.promoName : null,
    refillOverride: Boolean(detail.refillOverride),
    costTotal: detail.costTotal != null && Number.isFinite(Number(detail.costTotal)) ? Number(detail.costTotal) : null,
  };
}
