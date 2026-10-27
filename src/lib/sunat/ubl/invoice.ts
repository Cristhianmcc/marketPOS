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
} from './common';
import { appendHeaderTaxTotal, appendLineTaxTotal, lineAmounts, netOf, totalsByOperation } from './taxes';

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
  const signature = doc.ele('cac:Signature');
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
  const supplier = supplierParty.ele('cac:Party');
  const supplierPartyIdentification = supplier.ele('cac:PartyIdentification');
  supplierPartyIdentification.ele('cbc:ID', {
    schemeID: '6', // RUC
    schemeName: 'Documento de Identidad',
    schemeAgencyName: 'PE:SUNAT',
    schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(issuer.ruc);

  const supplierPartyName = supplier.ele('cac:PartyName');
  supplierPartyName.ele('cbc:Name').txt(issuer.razonSocial);

  // Dirección del emisor
  if (issuer.address) {
    const supplierAddress = supplier.ele('cac:PostalAddress');
    if (issuer.ubigeo) {
      supplierAddress.ele('cbc:ID').txt(issuer.ubigeo);
    }
    supplierAddress.ele('cbc:StreetName').txt(issuer.address);
    supplierAddress.ele('cac:Country').ele('cbc:IdentificationCode').txt('PE');
  }

  // Datos tributarios exigidos por SUNAT UBL 2.1.
  const supplierTaxScheme = supplier.ele('cac:PartyTaxScheme');
  supplierTaxScheme.ele('cbc:RegistrationName').txt(issuer.razonSocial);
  supplierTaxScheme.ele('cbc:CompanyID', {
    schemeID: '6',
    schemeName: 'SUNAT:Identificador de Documento de Identidad',
    schemeAgencyName: 'PE:SUNAT',
    schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(issuer.ruc);
  const registrationAddress = supplierTaxScheme.ele('cac:RegistrationAddress');
  if (issuer.ubigeo) {
    registrationAddress.ele('cbc:ID').txt(issuer.ubigeo);
  }
  registrationAddress.ele('cbc:AddressTypeCode').txt('0000');
  if (issuer.address) {
    registrationAddress.ele('cbc:StreetName').txt(issuer.address);
  }
  registrationAddress.ele('cac:Country').ele('cbc:IdentificationCode').txt('PE');
  const issuerTaxScheme = supplierTaxScheme.ele('cac:TaxScheme');
  issuerTaxScheme.ele('cbc:ID').txt('1000');
  issuerTaxScheme.ele('cbc:Name').txt('IGV');
  issuerTaxScheme.ele('cbc:TaxTypeCode').txt('VAT');

  const supplierLegalEntity = supplier.ele('cac:PartyLegalEntity');
  supplierLegalEntity.ele('cbc:RegistrationName').txt(issuer.razonSocial);
  const legalRegistrationAddress = supplierLegalEntity.ele('cac:RegistrationAddress');
  if (issuer.ubigeo) {
    legalRegistrationAddress.ele('cbc:ID').txt(issuer.ubigeo);
  }
  legalRegistrationAddress.ele('cbc:AddressTypeCode').txt('0000');
  if (issuer.address) {
    legalRegistrationAddress.ele('cbc:StreetName').txt(issuer.address);
  }
  legalRegistrationAddress.ele('cac:Country').ele('cbc:IdentificationCode').txt('PE');

  // AccountingCustomerParty (Cliente)
  const customerParty = doc.ele('cac:AccountingCustomerParty');
  const customerNode = customerParty.ele('cac:Party');
  const customerPartyIdentification = customerNode.ele('cac:PartyIdentification');
  
  const customerDocType = mapCustomerDocTypeToSunat(customer.docType);
  customerPartyIdentification.ele('cbc:ID', {
    schemeID: customerDocType,
    schemeName: 'Documento de Identidad',
    schemeAgencyName: 'PE:SUNAT',
    schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(customer.docNumber);

  // Dirección del cliente (opcional)
  if (customer.address) {
    const customerAddress = customerNode.ele('cac:PostalAddress');
    customerAddress.ele('cbc:StreetName').txt(customer.address);
    customerAddress.ele('cac:Country').ele('cbc:IdentificationCode').txt('PE');
  }

  const customerTaxScheme = customerNode.ele('cac:PartyTaxScheme');
  customerTaxScheme.ele('cbc:RegistrationName').txt(customer.name);
  customerTaxScheme.ele('cbc:CompanyID', {
    schemeID: customerDocType,
    schemeName: 'SUNAT:Identificador de Documento de Identidad',
    schemeAgencyName: 'PE:SUNAT',
    schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(customer.docNumber);
  customerTaxScheme.ele('cac:TaxScheme').ele('cbc:ID').txt('-');

  // En UBL 2.1 PostalAddress debe ir antes de PartyLegalEntity.
  const customerLegalEntity = customerNode.ele('cac:PartyLegalEntity');
  customerLegalEntity.ele('cbc:RegistrationName').txt(customer.name);

  const paymentTerms = doc.ele('cac:PaymentTerms');
  paymentTerms.ele('cbc:ID').txt('FormaPago');
  paymentTerms.ele('cbc:PaymentMeansID').txt('Contado');

  // TaxTotal: IGV, exonerado, inafecto e ICBPER
  appendHeaderTaxTotal(doc, totals, currency);

  // LegalMonetaryTotal (Totales). Valor de venta = gravada + exonerada + inafecta
  const legalMonetaryTotal = doc.ele('cac:LegalMonetaryTotal');
  legalMonetaryTotal.ele('cbc:LineExtensionAmount', { currencyID: currency })
    .txt(formatUBLAmount(totalsByOperation(totals).lineExtension));
  legalMonetaryTotal.ele('cbc:TaxInclusiveAmount', { currencyID: currency })
    .txt(formatUBLAmount(totals.total));
  if (totals.allowanceTotal && totals.allowanceTotal > 0) {
    legalMonetaryTotal.ele('cbc:AllowanceTotalAmount', { currencyID: currency })
      .txt(formatUBLAmount(totals.allowanceTotal));
  }
  legalMonetaryTotal.ele('cbc:PayableAmount', { currencyID: currency })
    .txt(formatUBLAmount(totals.total));

  // InvoiceLines (Items)
  items.forEach((item) => {
    const invoiceLine = doc.ele('cac:InvoiceLine');
    invoiceLine.ele('cbc:ID').txt(item.lineNumber.toString());
    
    const quantity = formatUBLQuantity(item.quantity);
    // ✅ PH8: Usar unitSunatCode del snapshot si está disponible
    const unitCode = item.unitSunatCode || mapUnitTypeToUBL(item.unitType);
    invoiceLine.ele('cbc:InvoicedQuantity', { unitCode }).txt(quantity);
    
    const { affectation, taxable: lineTaxable, unitValue } = lineAmounts(item);

    invoiceLine.ele('cbc:LineExtensionAmount', { currencyID: currency })
      .txt(formatUBLAmount(lineTaxable));

    // PricingReference (Precio unitario con IGV)
    const pricingReference = invoiceLine.ele('cac:PricingReference');
    const alternativeConditionPrice = pricingReference.ele('cac:AlternativeConditionPrice');
    alternativeConditionPrice.ele('cbc:PriceAmount', { currencyID: currency })
      .txt(formatUBLAmount(item.unitPrice));
    alternativeConditionPrice.ele('cbc:PriceTypeCode', {
      listName: 'Tipo de Precio',
      listAgencyName: 'PE:SUNAT',
      listURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16'
    }).txt('01'); // 01 = Precio unitario (incluye IGV)

    if (item.discountsApplied && item.discountsApplied > 0) {
      const discountGross = item.discountsApplied;
      const discountNet = netOf(discountGross, affectation);
      const baseNet = lineTaxable + discountNet;
      const allowance = invoiceLine.ele('cac:AllowanceCharge');
      allowance.ele('cbc:ChargeIndicator').txt('false');
      allowance.ele('cbc:AllowanceChargeReasonCode').txt('00');
      allowance.ele('cbc:MultiplierFactorNumeric')
        .txt(baseNet > 0 ? (discountNet / baseNet).toFixed(5) : '0.00000');
      allowance.ele('cbc:Amount', { currencyID: currency }).txt(formatUBLAmount(discountNet));
      allowance.ele('cbc:BaseAmount', { currencyID: currency }).txt(formatUBLAmount(baseNet));
    }

    // TaxTotal del item: IGV/EXO/INA según afectación e ICBPER de bolsas
    appendLineTaxTotal(invoiceLine, item, currency);

    // Item (Descripción del producto)
    const itemElement = invoiceLine.ele('cac:Item');
    itemElement.ele('cbc:Description').txt(item.description);

    // Price (Precio unitario sin IGV)
    const price = invoiceLine.ele('cac:Price');
    price.ele('cbc:PriceAmount', { currencyID: currency })
      .txt(formatUBLAmount(unitValue));
  });

  // Convertir a XML string
  return doc.end({ prettyPrint: true });
}
