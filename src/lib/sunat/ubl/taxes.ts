// Tributos UBL 2.1 compartidos por factura, boleta, nota de crédito y nota de débito.
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';
import type { SunatLineItem, SunatTotals } from '../types';
import { formatUBLAmount, formatUBLQuantity, mapUnitTypeToUBL } from './common';

export type IgvAffectationKind = 'GRAVADO' | 'EXONERADO' | 'INAFECTO';

/**
 * Catálogo 07 (afectación), 05 (tributos) y UN/ECE 5305 (categoría):
 * gravado 10 / IGV 1000 / S; exonerado 20 / EXO 9997 / E; inafecto 30 / INA 9998 / O.
 */
export const AFFECTATIONS: Record<IgvAffectationKind, {
  reasonCode: string;
  categoryId: string;
  schemeId: string;
  schemeName: string;
  taxTypeCode: string;
  percent: number;
}> = {
  GRAVADO: { reasonCode: '10', categoryId: 'S', schemeId: '1000', schemeName: 'IGV', taxTypeCode: 'VAT', percent: 18 },
  EXONERADO: { reasonCode: '20', categoryId: 'E', schemeId: '9997', schemeName: 'EXO', taxTypeCode: 'VAT', percent: 0 },
  INAFECTO: { reasonCode: '30', categoryId: 'O', schemeId: '9998', schemeName: 'INA', taxTypeCode: 'FRE', percent: 0 },
};

const ICBPER_SCHEME = { id: '7152', name: 'ICBPER', taxTypeCode: 'OTH' };

export function affectationOf(item: Pick<SunatLineItem, 'igvAffectation'>): IgvAffectationKind {
  return item.igvAffectation ?? 'GRAVADO';
}

/** Valor sin IGV de un importe con impuestos según la afectación. */
export function netOf(gross: number, affectation: IgvAffectationKind): number {
  return affectation === 'GRAVADO' ? gross / 1.18 : gross;
}

/** Base, IGV y valor unitario de la línea (sin ICBPER). */
export function lineAmounts(item: SunatLineItem) {
  const affectation = affectationOf(item);
  const taxable = item.taxableAmount ?? netOf(item.lineSubtotal, affectation);
  const tax = affectation === 'GRAVADO' ? (item.taxAmount ?? item.lineSubtotal - taxable) : 0;
  const unitValue = item.unitValue ?? (item.quantity > 0 ? taxable / item.quantity : 0);
  return { affectation, taxable, tax, unitValue, icbper: item.icbperAmount ?? 0 };
}

function appendTaxScheme(parent: XMLBuilder, id: string, name: string, taxTypeCode: string) {
  const scheme = parent.ele('cac:TaxScheme');
  scheme.ele('cbc:ID', { schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }).txt(id);
  scheme.ele('cbc:Name').txt(name);
  scheme.ele('cbc:TaxTypeCode').txt(taxTypeCode);
}

/**
 * TaxTotal de una línea: subtotal del IGV/EXO/INA y, para bolsas, el ICBPER
 * por unidad. El TaxAmount de la línea suma ambos tributos.
 */
export function appendLineTaxTotal(line: XMLBuilder, item: SunatLineItem, currency: string): void {
  const { affectation, taxable, tax, icbper } = lineAmounts(item);
  const rule = AFFECTATIONS[affectation];

  const taxTotal = line.ele('cac:TaxTotal');
  taxTotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(tax + icbper));

  const subtotal = taxTotal.ele('cac:TaxSubtotal');
  subtotal.ele('cbc:TaxableAmount', { currencyID: currency }).txt(formatUBLAmount(taxable));
  subtotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(tax));
  const category = subtotal.ele('cac:TaxCategory');
  category.ele('cbc:ID', { schemeID: 'UN/ECE 5305', schemeName: 'Tax Category Identifier', schemeAgencyName: 'United Nations Economic Commission for Europe' })
    .txt(rule.categoryId);
  category.ele('cbc:Percent').txt(rule.percent.toString());
  category.ele('cbc:TaxExemptionReasonCode', {
    listAgencyName: 'PE:SUNAT',
    listName: 'Afectacion del IGV',
    listURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07',
  }).txt(rule.reasonCode);
  appendTaxScheme(category, rule.schemeId, rule.schemeName, rule.taxTypeCode);

  if (icbper > 0 && item.icbperQuantity) {
    const bags = taxTotal.ele('cac:TaxSubtotal');
    bags.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(icbper));
    bags.ele('cbc:BaseUnitMeasure', { unitCode: item.unitSunatCode || mapUnitTypeToUBL(item.unitType) })
      .txt(formatUBLQuantity(item.icbperQuantity));
    const bagCategory = bags.ele('cac:TaxCategory');
    bagCategory.ele('cbc:PerUnitAmount', { currencyID: currency })
      .txt(formatUBLAmount(item.icbperUnitAmount ?? icbper / item.icbperQuantity));
    appendTaxScheme(bagCategory, ICBPER_SCHEME.id, ICBPER_SCHEME.name, ICBPER_SCHEME.taxTypeCode);
  }
}

/** Importes de cabecera por tipo de operación. */
export function totalsByOperation(totals: SunatTotals) {
  const taxed = totals.subtotal;
  const exempt = totals.exempt ?? 0;
  const unaffected = totals.unaffected ?? 0;
  const icbper = totals.icbper ?? 0;
  return { taxed, exempt, unaffected, icbper, lineExtension: taxed + exempt + unaffected };
}

/**
 * TaxTotal de cabecera: un subtotal por tributo presente (IGV, EXO, INA,
 * ICBPER). El IGV se informa siempre que haya operación gravada o ninguna otra.
 */
export function appendHeaderTaxTotal(parent: XMLBuilder, totals: SunatTotals, currency: string): void {
  const { taxed, exempt, unaffected, icbper } = totalsByOperation(totals);
  const taxTotal = parent.ele('cac:TaxTotal');
  taxTotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(totals.tax + icbper));

  const addSubtotal = (taxable: number, tax: number, kind: IgvAffectationKind) => {
    const rule = AFFECTATIONS[kind];
    const subtotal = taxTotal.ele('cac:TaxSubtotal');
    subtotal.ele('cbc:TaxableAmount', { currencyID: currency }).txt(formatUBLAmount(taxable));
    subtotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(tax));
    appendTaxScheme(subtotal.ele('cac:TaxCategory'), rule.schemeId, rule.schemeName, rule.taxTypeCode);
  };

  if (taxed > 0 || (exempt === 0 && unaffected === 0)) addSubtotal(taxed, totals.tax, 'GRAVADO');
  if (exempt > 0) addSubtotal(exempt, 0, 'EXONERADO');
  if (unaffected > 0) addSubtotal(unaffected, 0, 'INAFECTO');
  if (icbper > 0) {
    const bags = taxTotal.ele('cac:TaxSubtotal');
    bags.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(icbper));
    appendTaxScheme(bags.ele('cac:TaxCategory'), ICBPER_SCHEME.id, ICBPER_SCHEME.name, ICBPER_SCHEME.taxTypeCode);
  }
}
