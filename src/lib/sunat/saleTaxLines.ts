import type { SunatLineItem, SunatTotals } from './types';
import { sunatLineQuantity, type SaleItemQuantitySource } from './saleLineQuantity';

type DecimalLike = { toString(): string } | number | string | null | undefined;

export interface SaleItemTaxSource extends SaleItemQuantitySource {
  productName: string;
  productContent?: string | null;
  commercialName?: string | null;
  concentration?: string | null;
  pharmaceuticalForm?: string | null;
  unitType?: string | null;
  totalLine: DecimalLike;
  discountAmount?: DecimalLike;
  promotionDiscount?: DecimalLike;
  categoryPromoDiscount?: DecimalLike;
  volumePromoDiscount?: DecimalLike;
  nthPromoDiscount?: DecimalLike;
  igvAffectation?: 'GRAVADO' | 'EXONERADO' | 'INAFECTO' | null;
  icbperQuantity?: DecimalLike;
  icbperAmount?: DecimalLike;
  storeProduct?: { product?: { internalSku?: string | null; barcode?: string | null } | null } | null;
}

export interface SaleTaxSource {
  total: DecimalLike;
  icbperTotal?: DecimalLike;
  discountTotal?: DecimalLike;
  couponDiscount?: DecimalLike;
  items: SaleItemTaxSource[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function describe(item: SaleItemTaxSource): string {
  // ✅ PH8: Farmacia: nombre comercial + concentración + forma farmacéutica
  if (item.commercialName) {
    return [item.commercialName, item.concentration, item.pharmaceuticalForm].filter(Boolean).join(' ');
  }
  // Bodega/general: nombre del producto + contenido
  return [item.productName, item.productContent].filter(Boolean).join(' ');
}

/**
 * Líneas y totales SUNAT de una venta. SaleItem.totalLine ya contiene
 * promociones y descuento manual; el cupón y el descuento global viven en Sale
 * y se reparten proporcionalmente para que las líneas cuadren con lo cobrado.
 * Solo la operación gravada lleva IGV: su base se calcula sobre el total
 * gravado y la última línea gravada absorbe el redondeo. El ICBPER de bolsas
 * va aparte. Total = gravada + IGV + exonerada + inafecta + ICBPER.
 */
export function buildSaleTaxLines(sale: SaleTaxSource): { items: SunatLineItem[]; totals: SunatTotals } {
  const grossTotal = Number(sale.total);
  const icbperTotal = Number(sale.icbperTotal || 0);

  const directManualDiscount = sale.items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);
  const globalDiscount = Math.max(0, Number(sale.discountTotal || 0) - directManualDiscount);
  const headerDiscount = globalDiscount + Number(sale.couponDiscount || 0);
  const lineTotalsBeforeHeaderDiscount = sale.items.reduce((sum, item) => sum + Number(item.totalLine), 0);

  let allocatedHeaderDiscount = 0;
  const finalGrossByLine = sale.items.map((item, index) => {
    const grossBeforeHeaderDiscount = Number(item.totalLine);
    const isLastLine = index === sale.items.length - 1;
    const proportionalHeaderDiscount = isLastLine
      ? headerDiscount - allocatedHeaderDiscount
      : lineTotalsBeforeHeaderDiscount > 0
        ? round2(headerDiscount * grossBeforeHeaderDiscount / lineTotalsBeforeHeaderDiscount)
        : 0;
    allocatedHeaderDiscount += proportionalHeaderDiscount;
    return { proportionalHeaderDiscount, finalGross: Math.max(0, grossBeforeHeaderDiscount - proportionalHeaderDiscount) };
  });

  const affectationOf = (item: SaleItemTaxSource) => item.igvAffectation ?? 'GRAVADO';
  const taxedGross = round2(sale.items.reduce(
    (sum, item, index) => sum + (affectationOf(item) === 'GRAVADO' ? finalGrossByLine[index].finalGross : 0), 0,
  ));
  const taxableTotal = round2(taxedGross / 1.18);
  const igvTotal = round2(taxedGross - taxableTotal);
  const lastTaxedIndex = sale.items.map(affectationOf).lastIndexOf('GRAVADO');
  let allocatedTaxable = 0;
  let exemptTotal = 0;
  let unaffectedTotal = 0;
  let allowanceNet = 0;

  const items: SunatLineItem[] = sale.items.map((item, index) => {
    const { finalGross, proportionalHeaderDiscount } = finalGrossByLine[index];
    const affectation = affectationOf(item);
    let taxableAmount: number;
    if (affectation === 'GRAVADO') {
      taxableAmount = index === lastTaxedIndex
        ? Math.max(0, round2(taxableTotal - allocatedTaxable))
        : round2(finalGross / 1.18);
      allocatedTaxable += taxableAmount;
    } else {
      taxableAmount = round2(finalGross);
      if (affectation === 'EXONERADO') exemptTotal += taxableAmount;
      else unaffectedTotal += taxableAmount;
    }
    const taxAmount = affectation === 'GRAVADO' ? round2(finalGross - taxableAmount) : 0;
    const icbperAmount = Number(item.icbperAmount || 0);
    const icbperQuantity = item.icbperQuantity != null ? Number(item.icbperQuantity) : null;
    const automaticDiscounts =
      Number(item.promotionDiscount || 0) +
      Number(item.categoryPromoDiscount || 0) +
      Number(item.volumePromoDiscount || 0) +
      Number(item.nthPromoDiscount || 0);
    const totalDiscount = automaticDiscounts + Number(item.discountAmount || 0) + proportionalHeaderDiscount;
    allowanceNet += affectation === 'GRAVADO' ? totalDiscount / 1.18 : totalDiscount;
    // Unidad vendida (rollo, caja) cuando la línea usó precio por presentación.
    const line = sunatLineQuantity(item);

    return {
      lineNumber: index + 1,
      description: describe(item),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineSubtotal: round2(finalGross),
      taxableAmount,
      taxAmount,
      unitValue: line.quantity > 0 ? taxableAmount / line.quantity : 0,
      discountsApplied: round2(totalDiscount),
      // ✅ PH8: Usar código SUNAT del snapshot (ya validado en checkout)
      unitSunatCode: line.unitSunatCode,
      unitType: item.unitType ?? undefined,
      internalSku: item.storeProduct?.product?.internalSku,
      barcode: item.storeProduct?.product?.barcode,
      igvAffectation: affectation,
      ...(icbperAmount > 0 && icbperQuantity
        ? { icbperQuantity, icbperAmount, icbperUnitAmount: round2(icbperAmount / icbperQuantity) }
        : {}),
    };
  });

  const totals: SunatTotals = {
    subtotal: taxableTotal,
    tax: igvTotal,
    allowanceTotal: round2(allowanceNet),
    ...(exemptTotal > 0 ? { exempt: round2(exemptTotal) } : {}),
    ...(unaffectedTotal > 0 ? { unaffected: round2(unaffectedTotal) } : {}),
    ...(icbperTotal > 0 ? { icbper: round2(icbperTotal) } : {}),
    total: grossTotal,
    currency: 'PEN',
  };

  return { items, totals };
}

/** Campos de SaleItem que necesita buildSaleTaxLines (para `select` de Prisma). */
export const SALE_ITEM_TAX_SELECT = {
  productName: true,
  productContent: true,
  unitType: true,
  quantity: true,
  unitPrice: true,
  subtotal: true,
  totalLine: true,
  discountAmount: true,
  promotionDiscount: true,
  categoryPromoDiscount: true,
  volumePromoDiscount: true,
  nthPromoDiscount: true,
  unitSunatCode: true,
  unitSunatCodeUsed: true,
  pricingMode: true,
  quantityOriginal: true,
  sellUnitPriceApplied: true,
  igvAffectation: true,
  icbperQuantity: true,
  icbperAmount: true,
  commercialName: true,
  concentration: true,
  pharmaceuticalForm: true,
} as const;
