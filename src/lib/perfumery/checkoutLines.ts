/**
 * Perfumería en el checkout: valida y calcula las líneas "fragancia +
 * presentación (+ extras)" y los packs dentro de la transacción de la venta.
 *
 * - El precio sale de la presentación, los extras o el pack guardados (no del
 *   cliente).
 * - Promo "lleva N, paga M" por presentación (2x1/3x2), ver `promo.ts`.
 * - Relleno con `requiresPriorPurchase`: exige un cliente de la sede con una
 *   compra previa (no anulada) de una presentación `grantsRefill`, o que en la
 *   misma venta lleve una. El dueño puede autorizar la excepción.
 * - Pack: una línea por fragancia con el precio del pack prorrateado; sin
 *   descuentos ni promos; el regalo se descuenta con la primera línea.
 * - El stock se descuenta en el checkout con consumeSaleInventory (esencia en
 *   ml + envase + extras + regalo), junto al resto de productos.
 */
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { computeLineTaxes, type LineTaxes } from '@/lib/sales/lineTaxes';
import { hasRefillPurchase } from './customerHistory';
import { computePresentationPromos, promoLabel, type PresentationPromo } from './promo';
import {
  buildPerfumeLine, PerfumeLineError, splitPackPrice,
  type PerfumeLine, type PerfumeLineExtraInput, type PerfumeLinePackInput,
} from './saleLine';

export interface PerfumeCheckoutItem {
  storeProductId?: string;
  perfumePresentationId?: string;
  perfumeExtraIds?: string[];
  perfumePackId?: string;
  packItems?: Array<{ storeProductId?: string; perfumePresentationId?: string }>;
  refillOverride?: boolean;
  quantity: number;
  discountType?: 'PERCENT' | 'AMOUNT';
  discountValue?: number;
}

export interface PerfumeCheckoutContext {
  customerId?: string | null;
  role?: string;
  saleDate?: Date;
}

export class PerfumeCheckoutError extends Error {
  constructor(public code: string, public statusCode: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'PerfumeCheckoutError';
  }
}

export interface PreparedPerfumeLine extends PerfumeLine {
  essenceStoreProductId: string;
  essenceTracksStock: boolean;
  essenceUnitSunatCode: string;
  essenceUnitSymbol: string;
  bottles: number;
  promoDiscount: number;
  discountType: 'PERCENT' | 'AMOUNT' | null;
  discountValue: number | null;
  discountAmount: number;
  totalLine: number;
  lineTaxes: LineTaxes;
  container: { storeProductId: string; name: string; tracksStock: boolean } | null;
  /** Extras con producto y regalo de pack, con su control de stock. */
  otherStock: Array<{ storeProductId: string; name: string; quantity: number; tracksStock: boolean; kind: 'EXTRA' | 'GIFT' }>;
}

export function isPerfumeItem(item: { perfumePresentationId?: string; perfumePackId?: string; isService?: boolean; isFreeItem?: boolean }) {
  return Boolean(item.perfumePresentationId || item.perfumePackId) && !item.isService && !item.isFreeItem;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

type StockInfo = { name: string; stock: Prisma.Decimal | null };

export async function preparePerfumeLines(
  tx: Prisma.TransactionClient,
  storeId: string,
  items: PerfumeCheckoutItem[],
  context: PerfumeCheckoutContext = {}
): Promise<PreparedPerfumeLine[]> {
  if (items.length === 0) return [];
  const saleDate = context.saleDate ?? new Date();

  const store = await tx.store.findUnique({ where: { id: storeId }, select: { businessProfile: true } });
  if (store?.businessProfile !== 'PERFUMERIA') {
    throw new PerfumeCheckoutError('PERFUMERY_DISABLED', 403, 'La tienda no tiene el rubro Perfumería');
  }

  // Cada ítem del carrito se expande a "slots" fragancia + presentación.
  type Slot = {
    item: PerfumeCheckoutItem;
    storeProductId: string;
    presentationId: string;
    extraIds: string[];
    pack: { id: string; index: number; groupId: string } | null;
  };
  const slots: Slot[] = [];
  const packIds = new Set<string>();
  for (const item of items) {
    if (item.perfumePackId) {
      if (!Array.isArray(item.packItems) || item.packItems.length === 0) {
        throw new PerfumeCheckoutError('PACK_ITEMS_REQUIRED', 400, 'Elige las fragancias del pack');
      }
      if (item.perfumeExtraIds?.length) {
        throw new PerfumeCheckoutError('PACK_EXTRAS', 400, 'Los extras se venden aparte del pack');
      }
      packIds.add(item.perfumePackId);
      const groupId = randomUUID();
      item.packItems.forEach((packItem, index) => {
        slots.push({
          item,
          storeProductId: String(packItem?.storeProductId ?? ''),
          presentationId: String(packItem?.perfumePresentationId ?? ''),
          extraIds: [],
          pack: { id: item.perfumePackId!, index, groupId },
        });
      });
    } else {
      const extraIds = Array.isArray(item.perfumeExtraIds) ? [...new Set(item.perfumeExtraIds.map(String))] : [];
      slots.push({ item, storeProductId: item.storeProductId ?? '', presentationId: item.perfumePresentationId!, extraIds, pack: null });
    }
  }

  const presentationIds = [...new Set(slots.map((slot) => slot.presentationId))];
  const essenceIds = [...new Set(slots.map((slot) => slot.storeProductId))];
  const extraIds = [...new Set(slots.flatMap((slot) => slot.extraIds))];

  const stockProductSelect = {
    id: true, storeId: true, active: true, stock: true, costPrice: true, product: { select: { name: true } },
  } satisfies Prisma.StoreProductSelect;

  const [presentations, fragrances, extras, packs] = await Promise.all([
    tx.perfumePresentation.findMany({
      where: { id: { in: presentationIds }, storeId, active: true },
      include: { container: { select: stockProductSelect } },
    }),
    tx.fragrance.findMany({
      where: { storeProductId: { in: essenceIds }, storeId, active: true },
      include: {
        storeProduct: {
          select: {
            id: true, active: true, stock: true, costPrice: true, igvAffectation: true,
            product: { select: { name: true, baseUnit: { select: { sunatCode: true, symbol: true } } } },
          },
        },
      },
    }),
    extraIds.length
      ? tx.perfumeExtra.findMany({
          where: { id: { in: extraIds }, storeId, active: true },
          include: { storeProduct: { select: stockProductSelect } },
        })
      : Promise.resolve([]),
    packIds.size
      ? tx.perfumePack.findMany({
          where: { id: { in: [...packIds] }, storeId, active: true },
          include: { gift: { select: stockProductSelect } },
        })
      : Promise.resolve([]),
  ]);

  // Relleno: ¿la venta lleva una presentación que lo habilita?
  const saleGrantsRefill = slots.some((slot) => presentations.find((p) => p.id === slot.presentationId)?.grantsRefill);
  // (Un relleno dentro de un pack se rechaza más abajo por tamaño.)
  const refillSlots = slots.filter((slot) => !slot.pack && presentations.find((p) => p.id === slot.presentationId)?.requiresPriorPurchase);
  const overrideAllowed = context.role === 'OWNER';
  const refillChecked = new Set<Slot>();
  if (refillSlots.length && !saleGrantsRefill) {
    const needsCheck = refillSlots.filter((slot) => !(slot.item.refillOverride && overrideAllowed));
    if (needsCheck.length) {
      const name = presentations.find((p) => p.id === needsCheck[0].presentationId)!.name;
      if (!context.customerId) {
        throw new PerfumeCheckoutError(
          'REFILL_CUSTOMER_REQUIRED', 409,
          `${name}: solo para clientes que ya compraron un frasco. Selecciona el cliente.`
        );
      }
      const customer = await tx.customer.findFirst({
        where: { id: context.customerId, storeId, active: true }, select: { id: true },
      });
      if (!customer) throw new PerfumeCheckoutError('CUSTOMER_NOT_FOUND', 404, 'Cliente no encontrado o inactivo');
      if (!(await hasRefillPurchase(tx, storeId, context.customerId))) {
        throw new PerfumeCheckoutError(
          'REFILL_NOT_ALLOWED', 409,
          `${name}: el cliente no tiene una compra previa de frasco que habilite el relleno`
        );
      }
    }
    for (const slot of refillSlots) refillChecked.add(slot);
  }

  // Stock pedido por la venta completa: varias líneas pueden usar la misma
  // esencia, envase, feromona o regalo.
  const essenceNeeded = new Map<string, number>();
  const otherNeeded = new Map<string, number>();
  const otherInfo = new Map<string, StockInfo>();
  const addOther = (product: { id: string; stock: Prisma.Decimal | null; product: { name: string } }, qty: number) => {
    otherNeeded.set(product.id, (otherNeeded.get(product.id) ?? 0) + qty);
    otherInfo.set(product.id, { name: product.product.name, stock: product.stock });
  };
  const assertUsable = (
    product: { storeId: string; active: boolean; product: { name: string } } | null | undefined,
    label: string
  ) => {
    if (product && (!product.active || product.storeId !== storeId)) {
      throw new PerfumeCheckoutError('PRODUCT_INACTIVE', 409, `${label}: ${product.product.name} está desactivado`);
    }
  };

  const packPrices = new Map<Slot['item'], number[]>();
  const lines: PreparedPerfumeLine[] = slots.map((slot) => {
    const { item } = slot;
    const presentation = presentations.find((p) => p.id === slot.presentationId);
    if (!presentation) {
      throw new PerfumeCheckoutError('PRESENTATION_NOT_FOUND', 400, 'La presentación no existe o está desactivada');
    }
    const fragrance = fragrances.find((f) => f.storeProductId === slot.storeProductId);
    if (!fragrance || !fragrance.storeProduct.active) {
      throw new PerfumeCheckoutError('FRAGRANCE_NOT_FOUND', 400, 'La fragancia no existe o está desactivada');
    }
    const container = presentation.container;
    assertUsable(container, presentation.name);

    const lineExtras: PerfumeLineExtraInput[] = slot.extraIds.map((id) => {
      const extra = extras.find((e) => e.id === id);
      if (!extra) throw new PerfumeCheckoutError('EXTRA_NOT_FOUND', 400, 'El extra no existe o está desactivado');
      assertUsable(extra.storeProduct, extra.name);
      return {
        id: extra.id,
        name: extra.name,
        price: extra.price.toNumber(),
        extraEssenceMl: extra.extraEssenceMl?.toNumber() ?? null,
        product: extra.storeProduct
          ? { storeProductId: extra.storeProduct.id, name: extra.storeProduct.product.name, costPrice: extra.storeProduct.costPrice?.toNumber() ?? null }
          : null,
        productQty: extra.productQty.toNumber(),
      };
    });

    let packInput: PerfumeLinePackInput | null = null;
    if (slot.pack) {
      const pack = packs.find((p) => p.id === slot.pack!.id);
      if (!pack) throw new PerfumeCheckoutError('PACK_NOT_FOUND', 400, 'El pack no existe o está desactivado');
      if (item.packItems!.length !== pack.fragranceCount) {
        throw new PerfumeCheckoutError('PACK_COUNT', 400, `${pack.name}: elige ${pack.fragranceCount} fragancias`);
      }
      if (presentation.isRefill || !presentation.essenceMl.equals(pack.essenceMl)) {
        throw new PerfumeCheckoutError(
          'PACK_PRESENTATION', 400, `${pack.name}: ${presentation.name} no corresponde al tamaño del pack`
        );
      }
      if (item.discountType || item.refillOverride) {
        throw new PerfumeCheckoutError('PACK_DISCOUNT', 400, `${pack.name}: el pack ya tiene precio cerrado`);
      }
      assertUsable(pack.gift, pack.name);
      if (!packPrices.has(item)) packPrices.set(item, splitPackPrice(pack.price.toNumber(), pack.fragranceCount));
      packInput = {
        id: pack.id,
        name: pack.name,
        groupId: slot.pack.groupId,
        index: slot.pack.index,
        count: pack.fragranceCount,
        bottlePrice: packPrices.get(item)![slot.pack.index],
        gift: pack.gift
          ? { storeProductId: pack.gift.id, name: pack.gift.product.name, costPrice: pack.gift.costPrice?.toNumber() ?? null }
          : null,
      };
    }

    let line: PerfumeLine;
    try {
      line = buildPerfumeLine({
        bottles: item.quantity,
        fragrance: { code: fragrance.code, productName: fragrance.storeProduct.product.name },
        presentation: {
          id: presentation.id,
          name: presentation.name,
          essenceMl: presentation.essenceMl.toNumber(),
          price: presentation.price.toNumber(),
          isRefill: presentation.isRefill,
          grantsRefill: presentation.grantsRefill,
        },
        essenceCostPerMl: fragrance.storeProduct.costPrice?.toNumber() ?? null,
        container: container
          ? { storeProductId: container.id, name: container.product.name, costPrice: container.costPrice?.toNumber() ?? null }
          : null,
        extras: lineExtras,
        pack: packInput,
      });
    } catch (error) {
      if (error instanceof PerfumeLineError) throw new PerfumeCheckoutError(error.code, 400, error.message);
      throw error;
    }
    if (refillChecked.has(slot) && item.refillOverride && overrideAllowed && !saleGrantsRefill) {
      line.detail.refillOverride = true;
    }

    essenceNeeded.set(fragrance.storeProductId, (essenceNeeded.get(fragrance.storeProductId) ?? 0) + line.essenceMl);
    if (container) addOther(container, item.quantity);
    const otherStock: PreparedPerfumeLine['otherStock'] = [];
    for (const use of line.detail.stockUses) {
      const source = use.kind === 'GIFT'
        ? packs.find((p) => p.id === slot.pack?.id)?.gift
        : extras.find((e) => e.storeProduct?.id === use.storeProductId)?.storeProduct;
      if (!source) continue;
      addOther(source, use.quantity);
      otherStock.push({ ...use, tracksStock: source.stock !== null });
    }

    return {
      ...line,
      essenceStoreProductId: fragrance.storeProductId,
      essenceTracksStock: fragrance.storeProduct.stock !== null,
      essenceUnitSunatCode: fragrance.storeProduct.product.baseUnit?.sunatCode ?? 'MLT',
      essenceUnitSymbol: fragrance.storeProduct.product.baseUnit?.symbol ?? 'ml',
      bottles: item.quantity,
      promoDiscount: 0,
      discountType: null,
      discountValue: null,
      discountAmount: 0,
      totalLine: line.subtotal,
      lineTaxes: undefined as unknown as LineTaxes,
      container: container
        ? { storeProductId: container.id, name: container.product.name, tracksStock: container.stock !== null }
        : null,
      otherStock,
    };
  });

  // Promo 2x1/3x2 por presentación (no aplica a packs).
  const promos = new Map<string, PresentationPromo | null>(
    presentations.map((p) => [p.id, p.promoBuy && p.promoPay ? { buy: p.promoBuy, pay: p.promoPay } : null])
  );
  const promoDiscounts = computePresentationPromos(
    lines.map((line, index) => ({
      key: String(index),
      presentationId: line.detail.presentationId,
      bottles: line.bottles,
      presentationPrice: presentations.find((p) => p.id === line.detail.presentationId)!.price.toNumber(),
      inPack: Boolean(line.detail.pack),
    })),
    promos
  );

  lines.forEach((line, index) => {
    const item = slots[index].item;
    const promoDiscount = Math.min(promoDiscounts.get(String(index)) ?? 0, line.subtotal);
    if (promoDiscount > 0) {
      line.promoDiscount = promoDiscount;
      line.detail.promoName = promoLabel(promos.get(line.detail.presentationId)!);
    }
    const afterPromo = round2(line.subtotal - promoDiscount);

    let discountAmount = 0;
    if (!line.detail.pack && item.discountType && item.discountValue !== undefined && item.discountValue !== null) {
      if (item.discountType === 'PERCENT') {
        if (!(item.discountValue > 0 && item.discountValue <= 100)) {
          throw new PerfumeCheckoutError('INVALID_DISCOUNT_PERCENT', 400, `${line.productName}: descuento porcentual debe estar entre 1 y 100`);
        }
        discountAmount = round2((afterPromo * item.discountValue) / 100);
      } else if (item.discountType === 'AMOUNT') {
        if (!(item.discountValue > 0 && item.discountValue <= afterPromo)) {
          throw new PerfumeCheckoutError(
            'DISCOUNT_EXCEEDS_SUBTOTAL', 409,
            `${line.productName}: el descuento no puede ser mayor al subtotal (S/ ${afterPromo.toFixed(2)})`
          );
        }
        discountAmount = round2(item.discountValue);
      }
      discountAmount = Math.max(0, Math.min(discountAmount, afterPromo));
    }
    line.discountAmount = discountAmount;
    line.discountType = discountAmount > 0 ? item.discountType! : null;
    line.discountValue = discountAmount > 0 ? item.discountValue! : null;
    line.totalLine = round2(afterPromo - discountAmount);
    line.lineTaxes = computeLineTaxes({
      lineTotal: line.totalLine,
      igvAffectation: fragrances.find((f) => f.storeProductId === line.essenceStoreProductId)!.storeProduct.igvAffectation,
      icbper: false,
      quantity: line.bottles,
      saleDate,
    });
  });

  // Mensaje claro antes de descontar (el descuento atómico vuelve a validar).
  for (const [storeProductId, needed] of essenceNeeded) {
    const fragrance = fragrances.find((f) => f.storeProductId === storeProductId)!;
    const stock = fragrance.storeProduct.stock;
    if (stock !== null && stock.toNumber() < needed - 1e-9) {
      throw new PerfumeCheckoutError(
        'INSUFFICIENT_STOCK', 409,
        `${fragrance.code}: quedan ${stock.toNumber()} ml y la venta necesita ${needed} ml`,
        { productId: storeProductId, productName: fragrance.storeProduct.product.name, requested: needed, available: stock.toNumber() }
      );
    }
  }
  for (const [storeProductId, needed] of otherNeeded) {
    const info = otherInfo.get(storeProductId)!;
    if (info.stock !== null && info.stock.toNumber() < needed - 1e-9) {
      throw new PerfumeCheckoutError(
        'INSUFFICIENT_STOCK', 409,
        `${info.name}: quedan ${info.stock.toNumber()} y la venta necesita ${needed}`,
        { productId: storeProductId, productName: info.name, requested: needed, available: info.stock.toNumber() }
      );
    }
  }

  return lines;
}

/** Datos de SaleItem para una línea de perfume (snapshot completo). */
export function perfumeSaleItemData(saleId: string, line: PreparedPerfumeLine): Prisma.SaleItemUncheckedCreateInput {
  const zero = new Prisma.Decimal(0);
  return {
    saleId,
    storeProductId: line.essenceStoreProductId,
    productName: line.productName,
    // La presentación ya va en el nombre ("F754 ... - 100 ml Azul"); repetirla
    // aquí la duplicaría en ticket, boleta e impresión.
    productContent: null,
    unitType: 'UNIT',
    unitSunatCode: line.essenceUnitSunatCode,
    unitSymbol: line.essenceUnitSymbol,
    // Unidad base: ml descontados. El frasco viaja en quantityOriginal.
    quantity: new Prisma.Decimal(line.essenceMl),
    unitPrice: new Prisma.Decimal(line.unitPricePerMl),
    costPrice: line.costPerMl !== null ? new Prisma.Decimal(line.costPerMl) : null,
    subtotal: new Prisma.Decimal(line.subtotal),
    quantityOriginal: new Prisma.Decimal(line.bottles),
    pricingMode: 'SELL_UNIT_OVERRIDE',
    sellUnitPriceApplied: new Prisma.Decimal(line.bottlePrice),
    unitSunatCodeUsed: 'NIU',
    promotionDiscount: zero,
    categoryPromoDiscount: zero,
    volumePromoDiscount: zero,
    nthPromoDiscount: new Prisma.Decimal(line.promoDiscount),
    nthPromoName: line.detail.promoName,
    discountType: line.discountType,
    discountValue: line.discountValue !== null ? new Prisma.Decimal(line.discountValue) : null,
    discountAmount: new Prisma.Decimal(line.discountAmount),
    totalLine: new Prisma.Decimal(line.totalLine),
    igvAffectation: line.lineTaxes.igvAffectation,
    taxableAmount: new Prisma.Decimal(line.lineTaxes.taxableAmount),
    igvAmount: new Prisma.Decimal(line.lineTaxes.igvAmount),
    icbperQuantity: null,
    icbperAmount: zero,
    isService: false,
    perfumeDetail: line.detail as unknown as Prisma.InputJsonValue,
  };
}
