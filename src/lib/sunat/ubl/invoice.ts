// Generador de XML UBL 2.1 para Invoice (FACTURA/BOLETA)
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
  getDefaultIGVAffectation,
  getIGVPercentage,
} from './common';

/**
 * Genera el XML UBL 2.1 para una FACTURA o BOLETA
 * @param payload - Payload fiscal normalizado
 * @param docId - ID del documento (para la firma)
 * @returns XML string sin firma
 */
export function generateInvoiceXML(payload: SunatDocumentPayload, docId: string): string {
  const { issuer, customer, items, totals, metadata } = payload;
  const currency = getCurrencyCode(totals.currency);
  const issueDate = metadata.issueDate || new Date();

  // Crear documento raíz
  const doc = create({ version: '1.0', encoding: 'UTF-8', standalone: false })
    .ele('Invoice', UBL_NAMESPACES.INVOICE);

  // UBL Extensions (para la firma digital)
  const ublExtensions = doc.ele('ext:UBLExtensions');
  const ublExtension = ublExtensions.ele('ext:UBLExtension');
  ublExtension.ele('ext:ExtensionContent')
    .com('Signature placeholder - will be added by signing process');

  // UBL Version
  doc.ele('cbc:UBLVersionID').txt(getUBLVersion());
  
  // Customization ID (SUNAT requirement)
  doc.ele('cbc:CustomizationID').txt(getCustomizationId(metadata.docType));

  // ID del documento (SERIE-NUMERO)
  doc.ele('cbc:ID').txt(`${metadata.series}-${metadata.number.toString().padStart(8, '0')}`);

  // Fecha y hora de emisión
  doc.ele('cbc:IssueDate').txt(formatUBLDate(issueDate));
  doc.ele('cbc:IssueTime').txt(formatUBLTime(issueDate));

  // Tipo de documento (01=FACTURA, 03=BOLETA)
  const invoiceTypeCode = metadata.docType === 'FACTURA' ? '01' : '03';
  doc.ele('cbc:InvoiceTypeCode', { 
    listID: '0101', // Tipo de operación: Venta interna
    listAgencyName: 'PE:SUNAT',
    listName: 'Tipo de Documento',
    listURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
  }).txt(invoiceTypeCode);

  // Moneda del documento
  doc.ele('cbc:DocumentCurrencyCode').txt(currency);

  // Signature (referencia al ID para la firma)
  const signature = doc.ele('cac:Signature', { 'ID': docId });
  signature.ele('cbc:ID').txt(docId);
  const signatureParty = signature.ele('cac:SignatoryParty');
  const partyIdentification = signatureParty.ele('cac:PartyIdentification');
  partyIdentification.ele('cbc:ID').txt(issuer.ruc);
  const partyName = signatureParty.ele('cac:PartyName');
  partyName.ele('cbc:Name').txt(issuer.razonSocial);
  
  const digitalSignatureAttachment = signature.ele('cac:DigitalSignatureAttachment');
  digitalSignatureAttachment.ele('cac:ExternalReference')
    .ele('cbc:URI').txt('#' + docId);

  // AccountingSupplierParty (Emisor)
  const supplierParty = doc.ele('cac:AccountingSupplierParty');
  const supplierPartyIdentification = supplierParty.ele('cac:Party')
    .ele('cac:PartyIdentification');
  supplierPartyIdentification.ele('cbc:ID', {
    schemeID: '6', // RUC
    schemeName: 'Documento de Identidad',
    schemeAgencyName: 'PE:SUNAT',
    schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(issuer.ruc);

  const supplierPartyName = supplierParty.ele('cac:Party').ele('cac:PartyName');
  supplierPartyName.ele('cbc:Name').txt(issuer.razonSocial);

  // Dirección del emisor
  if (issuer.address) {
    const supplierAddress = supplierParty.ele('cac:Party').ele('cac:PostalAddress');
    supplierAddress.ele('cbc:ID').txt(issuer.ubigeo || '150101'); // Default Lima
    supplierAddress.ele('cbc:StreetName').txt(issuer.address);
    supplierAddress.ele('cac:Country').ele('cbc:IdentificationCode').txt('PE');
  }

  const supplierLegalEntity = supplierParty.ele('cac:Party').ele('cac:PartyLegalEntity');
  supplierLegalEntity.ele('cbc:RegistrationName').txt(issuer.razonSocial);

  // AccountingCustomerParty (Cliente)
  const customerParty = doc.ele('cac:AccountingCustomerParty');
  const customerPartyIdentification = customerParty.ele('cac:Party')
    .ele('cac:PartyIdentification');
  
  const customerDocType = mapCustomerDocTypeToSunat(customer.docType);
  customerPartyIdentification.ele('cbc:ID', {
    schemeID: customerDocType,
    schemeName: 'Documento de Identidad',
    schemeAgencyName: 'PE:SUNAT',
    schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(customer.docNumber);

  const customerLegalEntity = customerParty.ele('cac:Party').ele('cac:PartyLegalEntity');
  customerLegalEntity.ele('cbc:RegistrationName').txt(customer.name);

  // Dirección del cliente (opcional)
  if (customer.address) {
    const customerAddress = customerParty.ele('cac:Party').ele('cac:PostalAddress');
    customerAddress.ele('cbc:StreetName').txt(customer.address);
    customerAddress.ele('cac:Country').ele('cbc:IdentificationCode').txt('PE');
  }

  // TaxTotal (IGV)
  const taxTotal = doc.ele('cac:TaxTotal');
  taxTotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(totals.tax));
  
  const taxSubtotal = taxTotal.ele('cac:TaxSubtotal');
  taxSubtotal.ele('cbc:TaxableAmount', { currencyID: currency }).txt(formatUBLAmount(totals.subtotal));
  taxSubtotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(formatUBLAmount(totals.tax));
  
  const taxCategory = taxSubtotal.ele('cac:TaxCategory');
  const taxScheme = taxCategory.ele('cac:TaxScheme');
  taxScheme.ele('cbc:ID', {
    schemeID: 'UN/ECE 5153',
    schemeAgencyID: '6'
  }).txt(SUNAT_CATALOGS.TAX_TYPE.IGV);
  taxScheme.ele('cbc:Name').txt('IGV');
  taxScheme.ele('cbc:TaxTypeCode').txt('VAT');

  // LegalMonetaryTotal (Totales)
  const legalMonetaryTotal = doc.ele('cac:LegalMonetaryTotal');
  legalMonetaryTotal.ele('cbc:LineExtensionAmount', { currencyID: currency })
    .txt(formatUBLAmount(totals.subtotal));
  legalMonetaryTotal.ele('cbc:TaxInclusiveAmount', { currencyID: currency })
    .txt(formatUBLAmount(totals.total));
  legalMonetaryTotal.ele('cbc:PayableAmount', { currencyID: currency })
    .txt(formatUBLAmount(totals.total));

  // InvoiceLines (Items)
  items.forEach((item) => {
    const invoiceLine = doc.ele('cac:InvoiceLine');
    invoiceLine.ele('cbc:ID').txt(item.lineNumber.toString());
    
    const quantity = formatUBLQuantity(item.quantity);
    const unitCode = mapUnitTypeToUBL(item.unitType);
    invoiceLine.ele('cbc:InvoicedQuantity', { unitCode }).txt(quantity);
    
    invoiceLine.ele('cbc:LineExtensionAmount', { currencyID: currency })
      .txt(formatUBLAmount(item.lineSubtotal));

    // PricingReference (Precio unitario con IGV)
    const pricingReference = invoiceLine.ele('cac:PricingReference');
    const alternativeConditionPrice = pricingReference.ele('cac:AlternativeConditionPrice');
    const priceWithTax = item.unitPrice * 1.18; // Agregar IGV
    alternativeConditionPrice.ele('cbc:PriceAmount', { currencyID: currency })
      .txt(formatUBLAmount(priceWithTax));
    alternativeConditionPrice.ele('cbc:PriceTypeCode', {
      listName: 'Tipo de Precio',
      listAgencyName: 'PE:SUNAT',
      listURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16'
    }).txt('01'); // 01 = Precio unitario (incluye IGV)

    // TaxTotal del item
    const itemTaxTotal = invoiceLine.ele('cac:TaxTotal');
    const itemTax = item.lineSubtotal * 0.18; // IGV
    itemTaxTotal.ele('cbc:TaxAmount', { currencyID: currency })
      .txt(formatUBLAmount(itemTax));

    const itemTaxSubtotal = itemTaxTotal.ele('cac:TaxSubtotal');
    itemTaxSubtotal.ele('cbc:TaxableAmount', { currencyID: currency })
      .txt(formatUBLAmount(item.lineSubtotal));
    itemTaxSubtotal.ele('cbc:TaxAmount', { currencyID: currency })
      .txt(formatUBLAmount(itemTax));

    const itemTaxCategory = itemTaxSubtotal.ele('cac:TaxCategory');
    itemTaxCategory.ele('cbc:Percent').txt(getIGVPercentage().toString());
    itemTaxCategory.ele('cbc:TaxExemptionReasonCode').txt(getDefaultIGVAffectation());
    
    const itemTaxScheme = itemTaxCategory.ele('cac:TaxScheme');
    itemTaxScheme.ele('cbc:ID', {
      schemeID: 'UN/ECE 5153',
      schemeAgencyID: '6'
    }).txt(SUNAT_CATALOGS.TAX_TYPE.IGV);
    itemTaxScheme.ele('cbc:Name').txt('IGV');
    itemTaxScheme.ele('cbc:TaxTypeCode').txt('VAT');

    // Item (Descripción del producto)
    const itemElement = invoiceLine.ele('cac:Item');
    itemElement.ele('cbc:Description').txt(item.description);

    // Price (Precio unitario sin IGV)
    const price = invoiceLine.ele('cac:Price');
    price.ele('cbc:PriceAmount', { currencyID: currency })
      .txt(formatUBLAmount(item.unitPrice));
  });

  // Convertir a XML string
  return doc.end({ prettyPrint: true });
}
