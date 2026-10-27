// src/lib/sunat/buildPayloadFromDocument.ts
// ✅ MÓDULO 18.2: Construcción de payload fiscal desde ElectronicDocument existente
// Usado por GET /api/sunat/documents/:id/payload

import { PrismaClient } from '@prisma/client';
import { buildSaleTaxLines, SALE_ITEM_TAX_SELECT } from './saleTaxLines';
import {
  SunatDocumentPayload,
  SunatIssuer,
  SunatCustomer,
  SunatLineItem,
  SunatTotals,
  SunatError,
  SunatErrorCodes,
} from './types';

/**
 * Construye el payload fiscal desde un ElectronicDocument existente
 * Si tiene saleId asociado, usa los datos del Sale
 * Si no, usa los datos snapshot del documento
 */
export async function buildPayloadFromDocument(
  prisma: PrismaClient,
  documentId: string
): Promise<SunatDocumentPayload> {
  // 1. Leer documento con relaciones
  const doc = await prisma.electronicDocument.findUnique({
    where: { id: documentId },
    include: {
      sale: {
        include: {
          items: {
            select: { id: true, genericName: true, ...SALE_ITEM_TAX_SELECT },
          },
        },
      },
      sunatSettings: true
    }
  });

  if (!doc) {
    throw new SunatError(
      SunatErrorCodes.DOCUMENT_NOT_FOUND,
      `Documento ${documentId} no encontrado`,
      404
    );
  }

  // 2. Construir issuer desde SunatSettings
  const settings = doc.sunatSettings;
  
  if (!settings.ruc || !settings.razonSocial) {
    throw new SunatError(
      SunatErrorCodes.SUNAT_SETTINGS_INCOMPLETE,
      'Configuración SUNAT incompleta',
      409
    );
  }

  const issuer: SunatIssuer = {
    ruc: settings.ruc,
    razonSocial: settings.razonSocial,
    address: settings.address,
    ubigeo: settings.ubigeo,
    env: settings.env,
  };

  // 3. Construir customer desde snapshot del documento
  const customer: SunatCustomer = {
    docType: doc.customerDocType,
    docNumber: doc.customerDocNumber,
    name: doc.customerName,
    address: doc.customerAddress,
  };

  // 4-5. Líneas y totales. Si el documento cubre la venta completa se usan
  // las mismas líneas que la emisión (descuentos repartidos, afectaciones e
  // ICBPER); así una nota de crédito total cuadra con la boleta o factura.
  let items: SunatLineItem[];
  let totals: SunatTotals;

  const coversWholeSale = !!doc.sale
    && doc.sale.items.length > 0
    && Math.abs(Number(doc.total) - Number(doc.sale.total)) < 0.01;

  if (coversWholeSale) {
    ({ items, totals } = buildSaleTaxLines(doc.sale!));
  } else {
    // Documento parcial o sin venta: una línea con los importes del documento.
    // Si no hay operación gravada, la línea toma la afectación del documento.
    const exempt = Number(doc.exempt);
    const unaffected = Number(doc.unaffected);
    const icbper = Number(doc.icbper);
    const taxable = Number(doc.taxable);
    const igvAffectation = taxable > 0 ? 'GRAVADO' : exempt > 0 ? 'EXONERADO' : unaffected > 0 ? 'INAFECTO' : 'GRAVADO';
    const lineValue = taxable + exempt + unaffected;
    items = [{
      lineNumber: 1,
      description: 'Venta',
      quantity: 1,
      unitPrice: Number(doc.total) - icbper,
      lineSubtotal: Number(doc.total) - icbper,
      taxableAmount: lineValue,
      taxAmount: Number(doc.igv),
      unitValue: lineValue,
      discountsApplied: 0,
      igvAffectation,
    }];
    totals = {
      subtotal: taxable,
      tax: Number(doc.igv),
      ...(exempt > 0 ? { exempt } : {}),
      ...(unaffected > 0 ? { unaffected } : {}),
      ...(icbper > 0 ? { icbper } : {}),
      total: Number(doc.total),
      currency: doc.currency as 'PEN',
    };
  }

  // 6. Construir payload completo
  const payload: SunatDocumentPayload = {
    issuer,
    customer,
    items,
    totals,
    metadata: {
      docType: doc.docType,
      series: doc.series,
      number: doc.number,
      fullNumber: doc.fullNumber,
      issueDate: doc.issueDate,
      saleId: doc.saleId,
      documentId: doc.id,
    },
  };

  return payload;
}
