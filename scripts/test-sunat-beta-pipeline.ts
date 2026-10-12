import assert from 'node:assert/strict';
import { generateBetaCertificate } from '../src/lib/sunat/cert/generateBetaCertificate';
import {
  extractRucFromCertificate,
  isSelfSignedCertificate,
  parsePfxCertificate,
} from '../src/lib/sunat/cert/loadCertificate';
import { generateInvoiceXML } from '../src/lib/sunat/ubl/invoice';
import { signXml, verifyXmlSignature } from '../src/lib/sunat/sign/signXmlCrypto';
import { buildZip, extractFromZip } from '../src/lib/sunat/zip/buildZip';
import { parseCdr } from '../src/lib/sunat/cdr/parseCdr';
import type { SunatDocumentPayload } from '../src/lib/sunat/types';
import { validateBoletaData } from '../src/lib/sunat/validation/fiscalValidations';
import { generateCreditNoteXML } from '../src/lib/sunat/ubl/creditNote';
import { generateDebitNoteXML } from '../src/lib/sunat/ubl/debitNote';
import { generateSummaryXML, getSummaryFilename } from '../src/lib/sunat/ubl/summary';
import { generateVoidedXML, getVoidedFilename } from '../src/lib/sunat/ubl/voided';
import { parseSunatReferenceDate } from '../src/lib/sunat/referenceDate';
import { toSunatZipFilename } from '../src/lib/sunat/soap/sunatClient';
import { needsLegacyAddressTypeRepair } from '../src/lib/sunat/process/repairLegacyCpeDocument';
import { validateProductionReadiness } from '../src/lib/sunat/validation/productionReadiness';

async function main() {
  const peruDay = parseSunatReferenceDate('2026-10-11');
  assert.ok(peruDay);
  assert.equal(peruDay.dayStart.toISOString(), '2026-10-11T05:00:00.000Z');
  assert.equal(peruDay.dayEnd.toISOString(), '2026-10-12T04:59:59.999Z');
  assert.equal(peruDay.referenceDate.toISOString(), '2026-10-11T05:00:00.000Z');
  assert.equal(parseSunatReferenceDate('2026-02-30'), null);
  assert.equal(parseSunatReferenceDate('11/10/2026'), null);

  const generated = generateBetaCertificate('20123456789');
  const certificate = parsePfxCertificate(generated.pfxBase64, generated.password);
  assert.equal(extractRucFromCertificate(certificate), '20123456789');
  assert.equal(isSelfSignedCertificate(certificate), true);

  const productionReadiness = validateProductionReadiness({
    ruc: '20123456786',
    razonSocial: 'EMISOR DE PRUEBA SAC',
    address: 'AV. PRUEBA 123',
    solUser: 'MODDATOS',
    solPass: 'moddatos',
    certPfxBase64: generated.pfxBase64,
    certPassword: generated.password,
    stepTestSign: true,
  });
  assert.equal(productionReadiness.ready, false);
  assert.equal(productionReadiness.checks.fiscalData.ok, true);
  assert.equal(productionReadiness.checks.solCredentials.ok, false);
  assert.equal(productionReadiness.checks.certificate.ok, false);
  assert.match(productionReadiness.checks.solCredentials.message, /BETA/);
  assert.match(productionReadiness.checks.certificate.message, /autofirmado/);
  const payload: SunatDocumentPayload = {
    issuer: {
      ruc: '20123456789',
      razonSocial: 'EMISOR DE PRUEBA SAC',
      address: 'AV. PRUEBA 123',
      ubigeo: '150101',
      env: 'BETA',
    },
    customer: {
      docType: 'DNI',
      docNumber: '12345678',
      name: 'CLIENTE DE PRUEBA',
    },
    items: [
      {
        lineNumber: 1,
        description: 'PRODUCTO CON DESCUENTO',
        quantity: 2,
        unitPrice: 5.90,
        lineSubtotal: 10,
        taxableAmount: 8.47,
        taxAmount: 1.53,
        unitValue: 4.235,
        discountsApplied: 1.80,
        unitSunatCode: 'NIU',
      },
    ],
    totals: {
      subtotal: 8.47,
      tax: 1.53,
      allowanceTotal: 1.53,
      total: 10,
      currency: 'PEN',
    },
    metadata: {
      docType: 'BOLETA',
      series: 'B001',
      number: 1,
      fullNumber: 'B001-00000001',
      issueDate: new Date('2026-10-01T12:00:00-05:00'),
    },
  };

  const unsignedXml = generateInvoiceXML(payload, 'test-document');
  assert.equal((unsignedXml.match(/<cac:Party>/g) || []).length, 2);
  assert.match(unsignedXml, /<cbc:LineExtensionAmount currencyID="PEN">8\.47<\/cbc:LineExtensionAmount>/);
  assert.match(unsignedXml, /<cbc:TaxAmount currencyID="PEN">1\.53<\/cbc:TaxAmount>/);
  assert.match(unsignedXml, /<cbc:PayableAmount currencyID="PEN">10\.00<\/cbc:PayableAmount>/);

  const signed = signXml(unsignedXml, certificate, 'test-document');
  assert.equal(verifyXmlSignature(signed.signedXml, certificate), true);
  assert.equal(signed.signedXml.includes('MOCK_'), false);
  assert.ok(signed.digestValue);
  assert.ok(signed.signatureValue);

  const consumerFinalPayload: SunatDocumentPayload = {
    ...payload,
    customer: { docType: 'OTHER', docNumber: '-', name: 'CLIENTES VARIOS' },
    metadata: { ...payload.metadata, number: 2, fullNumber: 'B001-00000002' },
  };
  const consumerFinalXml = generateInvoiceXML(consumerFinalPayload, 'consumer-final-document');
  assert.match(consumerFinalXml, /schemeID="0"/);
  assert.match(consumerFinalXml, /<cbc:ID[^>]*>-<\/cbc:ID>/);
  assert.equal(validateBoletaData('OTHER', '-', 700).valid, true);
  assert.equal(validateBoletaData('OTHER', '-', 700.01).valid, false);
  assert.equal(validateBoletaData('DNI', '12345678', 700.01).valid, true);

  const notePayload: SunatDocumentPayload = {
    ...payload,
    metadata: { ...payload.metadata, docType: 'NOTA_CREDITO', series: 'BC01', number: 1, fullNumber: 'BC01-00000001' },
  };
  const creditXml = generateCreditNoteXML(notePayload, 'credit-note', {
    referencedDocType: 'BOLETA', referencedDocNumber: 'B001-00000001',
    creditNoteTypeCode: '01', creditNoteReason: 'ANULACION DE LA OPERACION',
  });
  assert.match(creditXml, /<cbc:ResponseCode>01<\/cbc:ResponseCode>/);
  assert.match(creditXml, /<cbc:DocumentTypeCode>03<\/cbc:DocumentTypeCode>/);
  assert.match(creditXml, /<cbc:AddressTypeCode>0000<\/cbc:AddressTypeCode>/);
  assert.equal(verifyXmlSignature(signXml(creditXml, certificate, 'credit-note').signedXml, certificate), true);
  assert.equal(needsLegacyAddressTypeRepair({
    docType: 'NOTA_CREDITO', store: { status: 'ACTIVE' }, xmlSigned: '<CreditNote/>', cdrZip: null, sunatTicket: null,
  }), true);
  assert.equal(needsLegacyAddressTypeRepair({
    docType: 'NOTA_CREDITO', store: { status: 'ARCHIVED' }, xmlSigned: '<CreditNote/>', cdrZip: null, sunatTicket: null,
  }), false);
  assert.equal(needsLegacyAddressTypeRepair({
    docType: 'NOTA_CREDITO', store: { status: 'ACTIVE' }, xmlSigned: '<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>', cdrZip: null, sunatTicket: null,
  }), false);

  const debitXml = generateDebitNoteXML(
    { ...notePayload, metadata: { ...notePayload.metadata, docType: 'NOTA_DEBITO', series: 'BD01' } },
    'debit-note',
    { referencedDocType: 'BOLETA', referencedDocNumber: 'B001-00000001', debitNoteTypeCode: '01', debitNoteReason: 'INTERESES' },
  );
  assert.match(debitXml, /<cbc:ResponseCode>01<\/cbc:ResponseCode>/);
  assert.equal(verifyXmlSignature(signXml(debitXml, certificate, 'debit-note').signedXml, certificate), true);

  const referenceDate = new Date('2026-10-01T12:00:00-05:00');
  const summaryName = getSummaryFilename(payload.issuer.ruc, 'RC01', 1, referenceDate);
  const summaryXml = generateSummaryXML({
    issuer: { ruc: payload.issuer.ruc, razonSocial: payload.issuer.razonSocial },
    referenceDate, issueDate: referenceDate, series: 'RC01', number: 1,
    lines: [{ documentId: 'boleta-1', series: 'B001', number: 1, docType: 'BOLETA', customerDocType: 'DNI', customerDocNumber: '12345678', taxable: 8.47, igv: 1.53, total: 10 }],
  }, 'summary-document');
  assert.equal(summaryName, '20123456789-RC-20261001-00001');
  assert.match(summaryXml, /<cbc:ID>RC-20261001-00001<\/cbc:ID>/);
  assert.match(summaryXml, /<cbc:ChargeIndicator>true<\/cbc:ChargeIndicator>/);
  assert.doesNotMatch(summaryXml, /<cbc:ChargeIndicator>false<\/cbc:ChargeIndicator>/);
  const signedSummaryXml = signXml(summaryXml, certificate, 'summary-document').signedXml;
  assert.equal(verifyXmlSignature(signedSummaryXml, certificate), true);
  assert.equal(extractFromZip(buildZip(summaryName, signedSummaryXml), `${summaryName}.xml`), signedSummaryXml);
  assert.equal(toSunatZipFilename(summaryName), `${summaryName}.zip`);

  const voidedName = getVoidedFilename(payload.issuer.ruc, 'RA01', 1, referenceDate);
  const voidedXml = generateVoidedXML({
    issuer: { ruc: payload.issuer.ruc, razonSocial: payload.issuer.razonSocial },
    referenceDate, issueDate: referenceDate, series: 'RA01', number: 1,
    lines: [{ documentId: 'invoice-1', documentTypeCode: '01', series: 'F001', number: 1, voidReason: 'ERROR EN LA OPERACION' }],
  }, 'voided-document');
  assert.equal(voidedName, '20123456789-RA-20261001-00001');
  assert.match(voidedXml, /<cbc:ID>RA-20261001-00001<\/cbc:ID>/);
  assert.equal(verifyXmlSignature(signXml(voidedXml, certificate, 'voided-document').signedXml, certificate), true);

  const acceptedCdr = `<?xml version="1.0"?><ApplicationResponse xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>Aceptado</cbc:Description></ApplicationResponse>`;
  const observedCdr = `<?xml version="1.0"?><ApplicationResponse xmlns:x="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><x:ResponseCode>0</x:ResponseCode><x:Description>Aceptado</x:Description><x:Note>Observación de prueba</x:Note></ApplicationResponse>`;
  const rejectedCdr = `<?xml version="1.0"?><ApplicationResponse xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ResponseCode>2101</cbc:ResponseCode><cbc:Description>XML inválido</cbc:Description></ApplicationResponse>`;

  const accepted = await parseCdr(buildZip('R-test.xml', acceptedCdr));
  const observed = await parseCdr(buildZip('R-test.xml', observedCdr));
  const rejected = await parseCdr(buildZip('R-test.xml', rejectedCdr));
  assert.equal(accepted?.isAccepted, true);
  assert.equal(accepted?.isObserved, false);
  assert.equal(observed?.isObserved, true);
  assert.equal(rejected?.isRejected, true);

  console.log('SUNAT BETA local pipeline: OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
