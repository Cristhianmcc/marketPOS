import assert from 'node:assert/strict';
import { generateBetaCertificate } from '../src/lib/sunat/cert/generateBetaCertificate';
import { parsePfxCertificate } from '../src/lib/sunat/cert/loadCertificate';
import { generateInvoiceXML } from '../src/lib/sunat/ubl/invoice';
import { signXml, verifyXmlSignature } from '../src/lib/sunat/sign/signXmlCrypto';
import { buildZip } from '../src/lib/sunat/zip/buildZip';
import { parseCdr } from '../src/lib/sunat/cdr/parseCdr';
import type { SunatDocumentPayload } from '../src/lib/sunat/types';

async function main() {
  const generated = generateBetaCertificate('20123456789');
  const certificate = parsePfxCertificate(generated.pfxBase64, generated.password);
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
