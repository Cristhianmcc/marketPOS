type DecimalLike = { toString(): string } | number | string | null | undefined;

export interface SaleItemQuantitySource {
  quantity: DecimalLike;
  unitPrice: DecimalLike;
  subtotal: DecimalLike;
  unitSunatCode?: string | null;
  unitSunatCodeUsed?: string | null;
  pricingMode?: string | null;
  quantityOriginal?: DecimalLike;
  sellUnitPriceApplied?: DecimalLike;
}

export interface SunatLineQuantity {
  quantity: number;
  /** Precio unitario con IGV, antes de descuentos. */
  unitPrice: number;
  unitSunatCode?: string;
}

/**
 * Cantidad, unidad y precio con que una línea de venta se informa a SUNAT.
 *
 * El detalle de venta guarda la cantidad en unidad base (100 m) y el precio
 * base (S/ 2.20). Con precio por presentación (1 rollo a S/ 200) eso daría
 * 100 × 2.20 = 220, distinto del importe cobrado. En ese caso la línea se
 * informa en la unidad vendida: 1 rollo × S/ 200.
 */
export function sunatLineQuantity(item: SaleItemQuantitySource): SunatLineQuantity {
  const baseQuantity = Number(item.quantity);
  const baseCode = item.unitSunatCode || undefined;
  const usedCode = item.unitSunatCodeUsed || undefined;
  const originalQuantity = Number(item.quantityOriginal ?? 0);

  if (item.pricingMode === 'SELL_UNIT_OVERRIDE' && originalQuantity > 0 && item.sellUnitPriceApplied != null) {
    if (usedCode && usedCode !== baseCode) {
      return { quantity: originalQuantity, unitPrice: Number(item.sellUnitPriceApplied), unitSunatCode: usedCode };
    }
    // Ventas anteriores no guardaban la unidad vendida: se conserva la unidad
    // base con el precio unitario que corresponde al importe cobrado.
    return {
      quantity: baseQuantity,
      unitPrice: baseQuantity > 0 ? Number(item.subtotal) / baseQuantity : Number(item.unitPrice),
      unitSunatCode: usedCode || baseCode,
    };
  }

  return { quantity: baseQuantity, unitPrice: Number(item.unitPrice), unitSunatCode: usedCode || baseCode };
}
