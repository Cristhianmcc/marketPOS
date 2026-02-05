// Generador de XML UBL 2.1 para DebitNote (NOTA DE DÉBITO)
import { create } from 'xmlbuilder2';
import type { SunatDocumentPayload } from '../types';
import { UBL_NAMESPACES, SUNAT_CATALOGS } from './types';
import {
  formatUBLDate,
  formatUBLTime,
  formatUBLAmount,
  formatUBLQuantity,
  mapCustomerDocTypeToSunat,
  getUBLVersion,
  getCustomizationId,
  getCurrencyCode,
  mapUnitTypeToUBL,
} from './common';

interface DebitNoteMetadata {
  referencedDocType: string; // FACTURA o BOLETA
  referencedDocNumber: string; // F001-00000001
  debitNoteTypeCode: string; // Catálogo 10
  debitNoteReason: string; // Motivo de la nota
}

/**
 * Genera el XML UBL 2.1 para una NOTA DE DÉBITO
 * @param payload - Payload fiscal normalizado
 * @param docId - ID del documento (para la firma)
 * @param metadata - Metadata específica de nota de débito
 * @returns XML string sin firma
 */
export function generateDebitNoteXML(
  payload: SunatDocumentPayload,
  docId: string,
  debitNoteMetadata: DebitNoteMetadata
): string {
  const { issuer, customer, items, totals, metadata } = payload;
  const currency = getCurrencyCode(totals.currency);
  const issueDate = metadata.issueDate || new Date();

  // Crear documento raíz
  const doc = create({ version: '1.0', encoding: 'UTF-8', standalone: false })
    .ele('DebitNote', UBL_NAMESPACES.DEBIT_NOTE);

  // UBL Extensions (para la firma digital)
  const ublExtensions = doc.ele('ext:UBLExtensions');
  const ublExtension = ublExtensions.ele('ext:UBLExtension');
  ublExtension.ele('ext:ExtensionContent')
    .com('Signature placeholder - will be added by signing process');

  // UBL Version
  doc.ele('cbc:UBLVersionID').txt(getUBLVersion());
  
  // Customization ID
  doc.ele('cbc:CustomizationID').txt(getCustomizationId('NOTA_DEBITO'));

  // ID del documento
  doc.ele('cbc:ID').txt(`${metadata.series}-${metadata.number.toString().padStart(8, '0')}`);

  // Fecha y hora de emisión
  doc.ele('cbc:IssueDate').txt(formatUBLDate(issueDate));
  doc.ele('cbc:IssueTime').txt(formatUBLTime(issueDate));

  // Moneda del documento
  doc.ele('cbc:DocumentCurrencyCode').txt(currency);

  // Documento de referencia
  const billingReference = doc.ele('cac:BillingReference');
  const invoiceDocumentReference = billingReference.ele('cac:InvoiceDocumentReference');
  invoiceDocumentReference.ele('cbc:ID').txt(debitNoteMetadata.referencedDocNumber);
  const refDocType = debitNoteMetadata.referencedDocType === 'FACTURA' ? '01' : '03';
  invoiceDocumentReference.ele('cbc:DocumentTypeCode').txt(refDocType);

  // Tipo y motivo de la nota de débito
  doc.ele('cbc:DiscrepancyResponse')
    .ele('cbc:ReferenceID').txt(debitNoteMetadata.referencedDocNumber);
  doc.ele('cbc:DiscrepancyResponse')
    .ele('cbc:ResponseCode').txt(debitNoteMetadata.debitNoteTypeCode);
  doc.ele('cbc:DiscrepancyResponse')
    .ele('cbc:Description').txt(debitNoteMetadata.debitNoteReason);

  // Signature
  const signature = doc.ele('cac:Signature', { 'ID': docId });
  signature.ele('cbc:ID').txt(docId);
  const signatureParty = signature.ele('cac:SignatoryParty');
  signatureParty.ele('cac:PartyIdentification').ele('cbc:ID').txt(issuer.ruc);
  signatureParty.ele('cac:PartyName').ele('cbc:Name').txt(issuer.razonSocial);
  signature.ele('cac:DigitalSignatureAttachment')
    .ele('cac:ExternalReference')
    .ele('cbc:URI').txt('#' + docId);

  // AccountingSupplierParty (Emisor)
  const supplierParty = doc.ele('cac:AccountingSupplierParty');
  const supplier = supplierParty.ele('cac:Party');
  supplier.ele('cac:PartyIdentification')
    .ele('cbc:ID', {
      schemeID: '6',
      schemeName: 'Documento de Identidad',
      schemeAgencyName: 'PE:SUNAT',
      schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
    }).txt(issuer.ruc);
  supplier.ele('cac:PartyName').ele('cbc:Name').txt(issuer.razonSocial);
  supplier.ele('cac:PartyLegalEntity').ele('cbc:RegistrationName').txt(issuer.razonSocial);

  // AccountingCustomerParty (Cliente)
  const customerParty = doc.ele('cac:AccountingCustomerParty');
  const custParty = customerParty.ele('cac:Party');
  const customerDocType = mapCustomerDocTypeToSunat(customer.docType);
  custParty.ele('cac:PartyIdentification')
    .ele('cbc:ID', {
      schemeID: customerDocType,
      schemeName: 'Documento de Identidad',
      schemeAgencyName: 'PE:SUNAT',
      schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
    }).txt(customer.docNumber);
  custParty.ele('cac:PartyLegalEntity').ele('cbc:RegistrationName').txt(customer.name);

  // TaxTotal
  const taxTotal = doc.ele('cac:TaxTotal');
  taxTotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(totals.tax));
  const taxSubtotal = taxTotal.ele('cac:TaxSubtotal');
  taxSubtotal.ele('cbc:TaxableAmount', { currencyID: currency }).txt(formatUBLAmount(totals.subtotal));
  taxSubtotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(totals.tax));
  const taxScheme = taxSubtotal.ele('cac:TaxCategory').ele('cac:TaxScheme');
  taxScheme.ele('cbc:ID').txt(SUNAT_CATALOGS.TAX_TYPE.IGV);
  taxScheme.ele('cbc:Name').txt('IGV');
  taxScheme.ele('cbc:TaxTypeCode').txt('VAT');

  // RequestedMonetaryTotal
  const requestedMonetaryTotal = doc.ele('cac:RequestedMonetaryTotal');
  requestedMonetaryTotal.ele('cbc:PayableAmount', { currencyID: currency })
    .txt(formatUBLAmount(totals.total));

  // DebitNoteLines (Items)
  items.forEach((item) => {
    const debitNoteLine = doc.ele('cac:DebitNoteLine');
    debitNoteLine.ele('cbc:ID').txt(item.lineNumber.toString());
    debitNoteLine.ele('cbc:DebitedQuantity', { unitCode: mapUnitTypeToUBL(item.unitType) })
      .txt(formatUBLQuantity(item.quantity));
    debitNoteLine.ele('cbc:LineExtensionAmount', { currencyID: currency })
      .txt(formatUBLAmount(item.lineSubtotal));

    // Item
    const itemElement = debitNoteLine.ele('cac:Item');
    itemElement.ele('cbc:Description').txt(item.description);

    // Price
    const price = debitNoteLine.ele('cac:Price');
    price.ele('cbc:PriceAmount', { currencyID: currency })
      .txt(formatUBLAmount(item.unitPrice));
  });

  return doc.end({ prettyPrint: true });
}
