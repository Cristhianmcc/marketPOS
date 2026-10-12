import type { PrismaClient } from '@prisma/client';
import { parseAdjustmentMetadata } from '../adjustmentMetadata';
import { buildPayloadFromDocument } from '../buildPayloadFromDocument';
import { loadCertificate } from '../cert/loadCertificate';
import { buildSunatQrText } from '../qr';
import { calculateXmlHash, signXml, verifyXmlSignature } from '../sign/signXmlCrypto';
import type { SunatDocumentPayload } from '../types';
import { generateCreditNoteXML } from '../ubl/creditNote';
import { generateDebitNoteXML } from '../ubl/debitNote';

type PrismaLike = PrismaClient | any;

export interface LegacyCpeRepairResult {
  document: any;
  repaired: boolean;
}

export function needsLegacyAddressTypeRepair(document: any): boolean {
  return (
    ['NOTA_CREDITO', 'NOTA_DEBITO'].includes(document.docType) &&
    document.store?.status === 'ACTIVE' &&
    !document.cdrZip &&
    !document.sunatTicket &&
    typeof document.xmlSigned === 'string' &&
    !document.xmlSigned.includes('AddressTypeCode')
  );
}

/**
 * Reconstruye notas creadas por versiones antiguas que omitían el código del
 * local anexo del emisor. Conserva serie, número y fecha: no consume un nuevo
 * correlativo ni toca documentos aceptados, con CDR o de tiendas archivadas.
 */
export async function repairLegacyCpeDocument(
  prisma: PrismaLike,
  job: any,
  document: any,
): Promise<LegacyCpeRepairResult> {
  if (!needsLegacyAddressTypeRepair(document)) {
    return { document, repaired: false };
  }

  const metadata = parseAdjustmentMetadata(document.voidReason);
  if (!metadata || !document.referenceDocId) {
    throw new Error(`No se puede reparar ${document.fullNumber}: faltan los datos de la nota`);
  }
  if (Math.abs(metadata.amount - Number(document.total)) > 0.001) {
    throw new Error(`No se puede reparar ${document.fullNumber}: el importe guardado no coincide`);
  }

  const reference = await prisma.electronicDocument.findFirst({
    where: {
      id: document.referenceDocId,
      storeId: document.storeId,
      docType: { in: ['FACTURA', 'BOLETA'] },
      status: { in: ['ACCEPTED', 'OBSERVED'] },
    },
  });
  if (!reference || reference.fullNumber !== metadata.referenceDocNumber) {
    throw new Error(`No se puede reparar ${document.fullNumber}: el comprobante de referencia no es válido`);
  }

  const basePayload = await buildPayloadFromDocument(prisma as PrismaClient, reference.id);
  const isFullCredit = document.docType === 'NOTA_CREDITO'
    && Math.abs(Number(document.total) - Number(reference.total)) < 0.001;
  const payload: SunatDocumentPayload = {
    ...basePayload,
    items: isFullCredit ? basePayload.items : [{
      lineNumber: 1,
      description: metadata.reason,
      quantity: 1,
      unitPrice: Number(document.total),
      lineSubtotal: Number(document.total),
      taxableAmount: Number(document.taxable),
      taxAmount: Number(document.igv),
      unitValue: Number(document.taxable),
      unitSunatCode: 'NIU',
    }],
    totals: {
      subtotal: Number(document.taxable),
      tax: Number(document.igv),
      total: Number(document.total),
      currency: document.currency,
    },
    metadata: {
      ...basePayload.metadata,
      docType: document.docType,
      documentId: document.id,
      series: document.series,
      number: document.number,
      fullNumber: document.fullNumber,
      issueDate: document.issueDate,
    },
  };

  const unsignedXml = document.docType === 'NOTA_CREDITO'
    ? generateCreditNoteXML(payload, document.id, {
      referencedDocType: metadata.referenceDocType,
      referencedDocNumber: metadata.referenceDocNumber,
      creditNoteTypeCode: metadata.reasonCode,
      creditNoteReason: metadata.reason,
    })
    : generateDebitNoteXML(payload, document.id, {
      referencedDocType: metadata.referenceDocType,
      referencedDocNumber: metadata.referenceDocNumber,
      debitNoteTypeCode: metadata.reasonCode,
      debitNoteReason: metadata.reason,
    });

  const certificate = await loadCertificate(prisma as PrismaClient, document.storeId);
  const signature = signXml(unsignedXml, certificate, document.id);
  if (!verifyXmlSignature(signature.signedXml, certificate)) {
    throw new Error(`No se pudo verificar la firma reconstruida de ${document.fullNumber}`);
  }
  const hash = calculateXmlHash(signature.signedXml);
  const qrText = buildSunatQrText({
    issuerRuc: payload.issuer.ruc,
    docType: document.docType,
    series: document.series,
    number: document.number,
    igv: Number(document.igv),
    total: Number(document.total),
    issueDate: document.issueDate,
    customerDocType: document.customerDocType,
    customerDocNumber: document.customerDocNumber,
    hash,
  });

  await prisma.$transaction(async (tx: any) => {
    await tx.electronicDocument.update({
      where: { id: document.id },
      data: {
        status: 'SIGNED',
        xmlSigned: signature.signedXml,
        hash,
        qrText,
        zipSentBase64: null,
        sunatCode: null,
        sunatMessage: null,
        sunatResponseAt: null,
      },
    });
    await tx.sunatJob.update({
      where: { id: job.id },
      data: { attempts: 0, lastError: null, nextRunAt: new Date() },
    });
  });

  return {
    repaired: true,
    document: {
      ...document,
      status: 'SIGNED',
      xmlSigned: signature.signedXml,
      hash,
      qrText,
      zipSentBase64: null,
      sunatCode: null,
      sunatMessage: null,
      sunatResponseAt: null,
    },
  };
}
