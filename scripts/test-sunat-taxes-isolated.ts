/**
 * Prueba aislada de afectaciones tributarias en el XML SUNAT.
 *
 * Genera, firma y valida con XSD una boleta, una factura, una nota de crédito
 * y un Resumen Diario con líneas gravadas, exoneradas, inafectas y una bolsa
 * con ICBPER, y comprueba códigos, tributos e importes. No usa base ni red.
 *
 * Contrato del payload (Fase 3 del plan de impuestos):
 *   SunatLineItem.igvAffectation  'GRAVADO' | 'EXONERADO' | 'INAFECTO' (por defecto GRAVADO)
 *   SunatLineItem.icbperQuantity / icbperUnitAmount / icbperAmount
 *   SunatTotals.subtotal = op. gravada; exempt = op. exonerada;
 *   SunatTotals.unaffected = op. inafecta; icbper = total ICBPER; total incluye ICBPER
 *   SummaryDocumentLine.exempt / unaffected / icbper
 *
 * Uso: npx tsx scripts/test-sunat-taxes-isolated.ts
 */
import assert from 'node:assert/strict';
import { generateBetaCertificate } from '../src/lib/sunat/cert/generateBetaCertificate';
import { parsePfxCertificate } from '../src/lib/sunat/cert/loadCertificate';
import { signXml } from '../src/lib/sunat/sign/signXmlCrypto';
import { generateInvoiceXML } from '../src/lib/sunat/ubl/invoice';
import { generateCreditNoteXML } from '../src/lib/sunat/ubl/creditNote';
import { generateSummaryXML, type SummaryPayload } from '../src/lib/sunat/ubl/summary';
import { validateSunatXml } from '../src/lib/sunat/validation/xsdValidation';
import type { SunatDocumentPayload } from '../src/lib/sunat/types';

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

/** Bloque XML de la línea n (InvoiceLine o CreditNoteLine). */
function lineBlock(xml: string, tag: 'InvoiceLine' | 'CreditNoteLine', n: number): string {
  const blocks = xml.split(`<cac:${tag}>`).slice(1).map((b) => b.split(`</cac:${tag}>`)[0]);
  return blocks[n - 1] || '';
}

/** TaxTotal de cabecera: lo que va antes de LegalMonetaryTotal y fuera de las líneas. */
function headerTaxTotal(xml: string): string {
  const beforeLines = xml.split(/<cac:(?:InvoiceLine|CreditNoteLine)>/)[0];
  const start = beforeLines.lastIndexOf('<cac:TaxTotal>');
  return start >= 0 ? beforeLines.slice(start, beforeLines.indexOf('</cac:TaxTotal>', start)) : '';
}

/** TaxSubtotal de cabecera para un tributo: { taxable, tax } o null. */
function headerSubtotal(xml: string, schemeId: string) {
  const header = headerTaxTotal(xml);
  for (const part of header.split('<cac:TaxSubtotal>').slice(1)) {
    if (new RegExp(`<cac:TaxScheme>\\s*<cbc:ID[^>]*>${schemeId}<`).test(part)) {
      return {
        taxable: Number(part.match(/<cbc:TaxableAmount[^>]*>([^<]+)</)?.[1] ?? NaN),
        tax: Number(part.match(/<cbc:TaxAmount[^>]*>([^<]+)</)?.[1] ?? NaN),
      };
    }
  }
  return null;
}

const amount = (xml: string, tag: string) => Number(xml.match(new RegExp(`<cbc:${tag}[^>]*>([^<]+)<`))?.[1] ?? NaN);

// ── Venta mixta ────────────────────────────────────────────────────────────
// Arroz gravado S/10 · Paracetamol exonerado 2 × S/2.50 · Libro inafecto S/20
// · 2 bolsas gravadas × S/0.10 + ICBPER 2 × S/0.50 = S/1.00. Total S/36.20.
const items = [
  { lineNumber: 1, description: 'ARROZ COSTEÑO 1KG', quantity: 1, unitPrice: 10, lineSubtotal: 10,
    taxableAmount: 8.47, taxAmount: 1.53, unitValue: 8.47, unitSunatCode: 'NIU', igvAffectation: 'GRAVADO' },
  { lineNumber: 2, description: 'PARACETAMOL 500MG', quantity: 2, unitPrice: 2.5, lineSubtotal: 5,
    taxableAmount: 5, taxAmount: 0, unitValue: 2.5, unitSunatCode: 'NIU', igvAffectation: 'EXONERADO' },
  { lineNumber: 3, description: 'LIBRO ESCOLAR', quantity: 1, unitPrice: 20, lineSubtotal: 20,
    taxableAmount: 20, taxAmount: 0, unitValue: 20, unitSunatCode: 'NIU', igvAffectation: 'INAFECTO' },
  { lineNumber: 4, description: 'BOLSA PLASTICA', quantity: 2, unitPrice: 0.1, lineSubtotal: 0.2,
    taxableAmount: 0.17, taxAmount: 0.03, unitValue: 0.085, unitSunatCode: 'NIU', igvAffectation: 'GRAVADO',
    icbperQuantity: 2, icbperUnitAmount: 0.5, icbperAmount: 1 },
];
const totals = { subtotal: 8.64, tax: 1.56, exempt: 5, unaffected: 20, icbper: 1, total: 36.2, currency: 'PEN' };

const basePayload = {
  issuer: { ruc: '20123456789', razonSocial: 'EMISOR DE PRUEBA SAC', address: 'AV. PRUEBA 123', ubigeo: '150101', env: 'BETA' },
  customer: { docType: 'DNI', docNumber: '12345678', name: 'CLIENTE DE PRUEBA' },
  items,
  totals,
  metadata: { docType: 'BOLETA', series: 'B001', number: 10, fullNumber: 'B001-00000010', issueDate: new Date('2026-10-27T12:00:00-05:00') },
} as unknown as SunatDocumentPayload;

function checkDocument(label: string, xml: string, tag: 'InvoiceLine' | 'CreditNoteLine') {
  const lines = [1, 2, 3, 4].map((n) => lineBlock(xml, tag, n));
  check(`${label}: gravado código 10 / IGV 1000`, /<cbc:TaxExemptionReasonCode[^>]*>10</.test(lines[0]) && /<cbc:ID[^>]*>1000</.test(lines[0]));
  check(`${label}: exonerado código 20 / EXO 9997 / categoría E`,
    /<cbc:TaxExemptionReasonCode[^>]*>20</.test(lines[1]) && /<cbc:ID[^>]*>9997</.test(lines[1]) && /<cbc:Name>EXO</.test(lines[1])
      && /<cac:TaxCategory>\s*<cbc:ID[^>]*>E</.test(lines[1]));
  check(`${label}: inafecto código 30 / INA 9998 / categoría O`,
    /<cbc:TaxExemptionReasonCode[^>]*>30</.test(lines[2]) && /<cbc:ID[^>]*>9998</.test(lines[2]) && /<cbc:Name>INA</.test(lines[2])
      && /<cac:TaxCategory>\s*<cbc:ID[^>]*>O</.test(lines[2]));
  check(`${label}: exonerado sin IGV en la línea`, amount(lines[1], 'TaxAmount') === 0, `TaxAmount ${amount(lines[1], 'TaxAmount')}`);
  check(`${label}: bolsa con ICBPER 7152 por unidad`,
    /<cbc:ID[^>]*>7152</.test(lines[3]) && /<cbc:Name>ICBPER</.test(lines[3]) && /<cbc:TaxTypeCode>OTH</.test(lines[3])
      && /<cbc:PerUnitAmount[^>]*>0\.50</.test(lines[3]) && /<cbc:BaseUnitMeasure[^>]*>2</.test(lines[3]));
  check(`${label}: impuestos de la línea de bolsa = IGV + ICBPER`, amount(lines[3], 'TaxAmount') === 1.03, `TaxAmount ${amount(lines[3], 'TaxAmount')}`);

  const igv = headerSubtotal(xml, '1000');
  const exo = headerSubtotal(xml, '9997');
  const ina = headerSubtotal(xml, '9998');
  const icb = headerSubtotal(xml, '7152');
  check(`${label}: cabecera gravada 8.64 / IGV 1.56`, igv?.taxable === 8.64 && igv?.tax === 1.56, JSON.stringify(igv));
  check(`${label}: cabecera exonerada 5.00`, exo?.taxable === 5 && exo?.tax === 0, JSON.stringify(exo));
  check(`${label}: cabecera inafecta 20.00`, ina?.taxable === 20 && ina?.tax === 0, JSON.stringify(ina));
  check(`${label}: cabecera ICBPER 1.00`, icb?.tax === 1, JSON.stringify(icb));
  check(`${label}: total de impuestos 2.56 (IGV + ICBPER)`, amount(headerTaxTotal(xml), 'TaxAmount') === 2.56, `${amount(headerTaxTotal(xml), 'TaxAmount')}`);
  check(`${label}: valor de venta 33.64`, amount(xml, 'LineExtensionAmount') === 33.64, `${amount(xml, 'LineExtensionAmount')}`);
  check(`${label}: importe total 36.20`, amount(xml, 'PayableAmount') === 36.2, `${amount(xml, 'PayableAmount')}`);
}

async function main() {
  const generated = generateBetaCertificate('20123456789');
  const certificate = parsePfxCertificate(generated.pfxBase64, generated.password);

  async function signedXsd(docType: Parameters<typeof validateSunatXml>[0], xml: string, id: string) {
    const signed = signXml(xml, certificate, id).signedXml;
    const result = await validateSunatXml(docType, signed);
    check(`${docType}: XSD válido`, result.valid, result.valid ? undefined : (result.message || result.errors.join(' | ')).slice(0, 160));
  }

  // Boleta y factura mixtas
  const boletaXml = generateInvoiceXML(basePayload, 'boleta-mixta');
  checkDocument('Boleta', boletaXml, 'InvoiceLine');
  await signedXsd('BOLETA', boletaXml, 'boleta-mixta');

  const facturaPayload = {
    ...basePayload,
    customer: { docType: 'RUC', docNumber: '20987654321', name: 'CLIENTE EMPRESA SAC', address: 'JR. UNION 456' },
    metadata: { ...basePayload.metadata, docType: 'FACTURA', series: 'F001', fullNumber: 'F001-00000010' },
  } as SunatDocumentPayload;
  const facturaXml = generateInvoiceXML(facturaPayload, 'factura-mixta');
  checkDocument('Factura', facturaXml, 'InvoiceLine');
  await signedXsd('FACTURA', facturaXml, 'factura-mixta');

  // Nota de crédito total de la boleta mixta
  const creditXml = generateCreditNoteXML(
    { ...basePayload, metadata: { ...basePayload.metadata, docType: 'NOTA_CREDITO', series: 'BC01', number: 1, fullNumber: 'BC01-00000001' } } as SunatDocumentPayload,
    'nota-mixta',
    { referencedDocType: 'BOLETA', referencedDocNumber: 'B001-00000010', creditNoteTypeCode: '01', creditNoteReason: 'ANULACION DE LA OPERACION' },
  );
  checkDocument('Nota de crédito', creditXml, 'CreditNoteLine');
  await signedXsd('NOTA_CREDITO', creditXml, 'nota-mixta');

  // Resumen Diario con la boleta mixta
  const referenceDate = new Date('2026-10-27T12:00:00-05:00');
  const summaryXml = generateSummaryXML({
    issuer: { ruc: '20123456789', razonSocial: 'EMISOR DE PRUEBA SAC' },
    referenceDate, issueDate: referenceDate, series: 'RC', number: 1,
    lines: [{
      documentId: 'boleta-mixta', series: 'B001', number: 10, docType: 'BOLETA', customerDocType: 'DNI', customerDocNumber: '12345678',
      taxable: 8.64, igv: 1.56, exempt: 5, unaffected: 20, icbper: 1, total: 36.2,
    }],
  } as unknown as SummaryPayload, 'resumen-mixto');
  const payments = Object.fromEntries(
    summaryXml.split('<sac:BillingPayment>').slice(1).map((b) => [b.match(/<cbc:InstructionID>([^<]+)</)?.[1], Number(b.match(/<cbc:PaidAmount[^>]*>([^<]+)</)?.[1])]),
  );
  check('Resumen: gravado 01 = 8.64', payments['01'] === 8.64, JSON.stringify(payments));
  check('Resumen: exonerado 02 = 5.00', payments['02'] === 5, JSON.stringify(payments));
  check('Resumen: inafecto 03 = 20.00', payments['03'] === 20, JSON.stringify(payments));
  check('Resumen: ICBPER 7152 = 1.00', /<cbc:ID[^>]*>7152</.test(summaryXml) && /<cbc:TaxAmount[^>]*>1\.00</.test(summaryXml));
  check('Resumen: total 36.20', /<sac:TotalAmount[^>]*>36\.20</.test(summaryXml));
  await signedXsd('SUMMARY', summaryXml, 'resumen-mixto');

  // Una venta solo gravada no debe cambiar
  const onlyTaxed = generateInvoiceXML({
    ...basePayload,
    items: [items[0]],
    totals: { subtotal: 8.47, tax: 1.53, total: 10, currency: 'PEN' },
  } as unknown as SunatDocumentPayload, 'solo-gravado');
  check('Solo gravado: sin EXO, INA ni ICBPER', !/9997|9998|7152/.test(onlyTaxed));
  check('Solo gravado: total 10.00', amount(onlyTaxed, 'PayableAmount') === 10);

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${!c.ok && c.detail ? `  (${c.detail})` : ''}`);
  }
  console.log(`\nImpuestos SUNAT: ${checks.length - failed}/${checks.length} comprobaciones correctas.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
