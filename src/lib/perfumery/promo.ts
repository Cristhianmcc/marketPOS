/**
 * Perfumería: promoción "lleva N, paga M" por presentación (2x1, 3x2).
 *
 * Se cuenta en toda la venta por presentación, sin importar la fragancia: dos
 * rellenos de fragancias distintas forman un 2x1. Se bonifica solo el precio
 * de la presentación (los extras se cobran). Las líneas de pack no entran.
 * El descuento se reparte entre las líneas por frascos (centavos exactos, la
 * diferencia va a la última): ninguna línea queda en 0, que la boleta
 * electrónica trataría como gratuita.
 * La usan el checkout (cobro real) y el POS (vista previa del total).
 */

export interface PresentationPromo {
  buy: number;
  pay: number;
}

export interface PromoLineInput {
  key: string;
  presentationId: string;
  bottles: number;
  presentationPrice: number;
  inPack: boolean;
}

export function isValidPromo(buy: unknown, pay: unknown): boolean {
  return Number.isInteger(buy) && Number.isInteger(pay) && (pay as number) >= 1 && (buy as number) > (pay as number) && (buy as number) <= 10;
}

export function promoLabel(promo: PresentationPromo): string {
  return `${promo.buy}x${promo.pay}`;
}

/** Descuento por línea (key → soles). */
export function computePresentationPromos(
  lines: PromoLineInput[],
  promos: Map<string, PresentationPromo | null>
): Map<string, number> {
  const result = new Map<string, number>();
  const byPresentation = new Map<string, PromoLineInput[]>();
  for (const line of lines) {
    if (line.inPack) continue;
    const promo = promos.get(line.presentationId);
    if (!promo || !isValidPromo(promo.buy, promo.pay)) continue;
    byPresentation.set(line.presentationId, [...(byPresentation.get(line.presentationId) ?? []), line]);
  }
  for (const [presentationId, group] of byPresentation) {
    const promo = promos.get(presentationId)!;
    const units = group.reduce((sum, line) => sum + line.bottles, 0);
    const free = Math.floor(units / promo.buy) * (promo.buy - promo.pay);
    if (free <= 0) continue;
    const totalCents = Math.round(free * group[0].presentationPrice * 100);
    let given = 0;
    group.forEach((line, index) => {
      const cents = index === group.length - 1
        ? totalCents - given
        : Math.floor((totalCents * line.bottles) / units);
      given += cents;
      result.set(line.key, cents / 100);
    });
  }
  return result;
}
