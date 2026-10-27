import type { IgvAffectation } from '@prisma/client';

/** Tasa del IGV (incluye el 2 % de Impuesto de Promoción Municipal). */
export const IGV_RATE = 0.18;

/**
 * Tarifa del ICBPER por bolsa plástica (Ley 30884), según el año de la venta.
 * Desde 2023 es S/ 0.50; actualizar aquí si cambia la norma.
 */
const ICBPER_RATES: Array<{ fromYear: number; amount: number }> = [
  { fromYear: 2023, amount: 0.5 },
  { fromYear: 2022, amount: 0.4 },
  { fromYear: 2021, amount: 0.3 },
  { fromYear: 2020, amount: 0.2 },
  { fromYear: 2019, amount: 0.1 },
];

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Tarifa por bolsa vigente en la fecha (hora de Lima). */
export function icbperRateFor(date: Date): number {
  const year = Number(date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 4));
  return ICBPER_RATES.find((rate) => year >= rate.fromYear)?.amount ?? 0;
}

export interface LineTaxes {
  igvAffectation: IgvAffectation;
  /** Valor de venta sin IGV (base de la línea). */
  taxableAmount: number;
  igvAmount: number;
  icbperQuantity: number | null;
  icbperAmount: number;
}

/**
 * Tributos de una línea a partir de su importe final (precio que paga el
 * cliente, ya con descuentos de la línea). Gravado: el importe incluye IGV.
 * Exonerado e inafecto: el importe no lleva IGV. ICBPER: monto fijo por bolsa
 * que se suma aparte del importe.
 */
export function computeLineTaxes(input: {
  lineTotal: number;
  igvAffectation?: IgvAffectation | null;
  icbper?: boolean;
  /** Cantidad en unidad base (bolsas). */
  quantity: number;
  saleDate: Date;
}): LineTaxes {
  const affectation = input.igvAffectation ?? 'GRAVADO';
  const lineTotal = round2(input.lineTotal);
  const taxableAmount = affectation === 'GRAVADO' ? round2(lineTotal / (1 + IGV_RATE)) : lineTotal;
  const igvAmount = round2(lineTotal - taxableAmount);

  const icbperQuantity = input.icbper ? input.quantity : null;
  const icbperAmount = input.icbper ? round2(input.quantity * icbperRateFor(input.saleDate)) : 0;

  return { igvAffectation: affectation, taxableAmount, igvAmount, icbperQuantity, icbperAmount };
}
