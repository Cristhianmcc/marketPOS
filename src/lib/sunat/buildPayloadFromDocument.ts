// src/lib/sunat/buildPayloadFromDocument.ts
// ✅ MÓDULO 18.2: Construcción de payload fiscal desde ElectronicDocument existente
// Usado por GET /api/sunat/documents/:id/payload

import { PrismaClient } from '@prisma/client';
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
          items: true
        }
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

  // 4. Construir items
  let items: SunatLineItem[];

  if (doc.sale && doc.sale.items.length > 0) {
    // Usar datos del Sale si están disponibles
    items = doc.sale.items.map((item, index) => {
      let description = item.productName;
      if (item.productContent) {
        description += ` ${item.productContent}`;
      }

      return {
        lineNumber: index + 1,
        description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineSubtotal: Number(item.subtotal),
        discountsApplied: Number(item.discountAmount || 0),
        unitType: item.unitType,
        // SKU y barcode se tomarían de storeProduct si se incluye en la query
      };
    });
  } else {
    // Fallback: crear un ítem genérico
    items = [{
      lineNumber: 1,
      description: 'Venta',
      quantity: 1,
      unitPrice: Number(doc.taxable) + Number(doc.igv),
      lineSubtotal: Number(doc.total),
      discountsApplied: 0,
    }];
  }

  // 5. Construir totals desde snapshot del documento
  const totals: SunatTotals = {
    subtotal: Number(doc.taxable),
    tax: Number(doc.igv),
    total: Number(doc.total),
    currency: doc.currency as 'PEN',
  };

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
