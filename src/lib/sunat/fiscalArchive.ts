import crypto from 'crypto';
import type { Prisma } from '@prisma/client';

export type FiscalArchive = {
  version: number;
  exportedAt: string;
  source: { storeId: string; storeName: string; ruc: string | null };
  settings: Record<string, unknown> | null;
  documents: Array<Record<string, unknown> & {
    id: string;
    docType: string;
    series: string;
    number: number;
  }>;
};

export type FiscalArchiveEnvelope = {
  data: FiscalArchive;
  checksum: string;
};

const STATUS_RANK: Record<string, number> = {
  DRAFT: 0, PENDING: 1, XML_BUILT: 2, SIGNED: 3, SENT: 4,
  ERROR: 4, REJECTED: 5, ACCEPTED: 6, OBSERVED: 6, CANCELED: 7,
};

const ALLOWED_DOC_TYPES = ['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'SUMMARY', 'VOIDED'];

function digest(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function validateFiscalArchiveEnvelope(value: unknown): FiscalArchiveEnvelope {
  const envelope = value as Partial<FiscalArchiveEnvelope> | null;
  if (!envelope?.data || envelope.data.version !== 1 || envelope.checksum !== `sha256:${digest(envelope.data)}`) {
    throw new Error('Archivo fiscal inválido o corrupto');
  }
  return envelope as FiscalArchiveEnvelope;
}

export async function restoreFiscalArchive(
  tx: Prisma.TransactionClient,
  storeId: string,
  currentRuc: string | null,
  archive: FiscalArchive
): Promise<{ created: number; updated: number; skipped: number }> {
  const sourceRuc = archive.source.ruc?.replace(/\D/g, '') || null;
  const normalizedCurrentRuc = currentRuc?.replace(/\D/g, '') || null;
  if (sourceRuc && normalizedCurrentRuc && sourceRuc !== normalizedCurrentRuc) {
    throw new Error('El respaldo fiscal pertenece a otra tienda');
  }

  const sourceSettings = archive.settings || {};
  const archivedDocs = Array.isArray(archive.documents) ? archive.documents : [];
  const existingSettings = await tx.sunatSettings.findUnique({ where: { storeId } });
  const restoredSettings = {
    env: 'BETA' as const,
    enabled: false,
    ruc: text(sourceSettings.ruc) || normalizedCurrentRuc,
    razonSocial: text(sourceSettings.razonSocial),
    address: text(sourceSettings.address),
    ubigeo: text(sourceSettings.ubigeo),
    defaultFacturaSeries: text(sourceSettings.defaultFacturaSeries) || 'F001',
    defaultBoletaSeries: text(sourceSettings.defaultBoletaSeries) || 'B001',
    defaultNcSeries: text(sourceSettings.defaultNcSeries) || 'FC01',
    defaultNdSeries: text(sourceSettings.defaultNdSeries) || 'FD01',
    defaultSummarySeries: 'RC',
    defaultVoidedSeries: 'RA',
    nextFacturaNumber: Math.max(existingSettings?.nextFacturaNumber || 1, Number(sourceSettings.nextFacturaNumber) || 1),
    nextBoletaNumber: Math.max(existingSettings?.nextBoletaNumber || 1, Number(sourceSettings.nextBoletaNumber) || 1),
    nextNcNumber: Math.max(existingSettings?.nextNcNumber || 1, Number(sourceSettings.nextNcNumber) || 1),
    nextNdNumber: Math.max(existingSettings?.nextNdNumber || 1, Number(sourceSettings.nextNdNumber) || 1),
    nextSummaryNumber: Math.max(existingSettings?.nextSummaryNumber || 1, Number(sourceSettings.nextSummaryNumber) || 1),
    nextVoidedNumber: Math.max(existingSettings?.nextVoidedNumber || 1, Number(sourceSettings.nextVoidedNumber) || 1),
  };
  await tx.sunatSettings.upsert({
    where: { storeId },
    create: { storeId, ...restoredSettings },
    update: restoredSettings,
  });

  const saleNumbers = archivedDocs.map(doc => Number(doc.saleNumber)).filter(Number.isFinite);
  const sales = saleNumbers.length
    ? await tx.sale.findMany({ where: { storeId, saleNumber: { in: saleNumbers } }, select: { id: true, saleNumber: true } })
    : [];
  const saleByNumber = new Map(sales.map(sale => [sale.saleNumber, sale.id]));
  const sourceIdToNewId = new Map<string, string>();
  let created = 0;
  let updated = 0;

  for (const doc of archivedDocs) {
    if (!ALLOWED_DOC_TYPES.includes(doc.docType)) {
      continue;
    }
    const existing = await tx.electronicDocument.findUnique({
      where: {
        storeId_docType_series_number: {
          storeId,
          docType: doc.docType as any,
          series: String(doc.series),
          number: Number(doc.number),
        },
      },
    });
    const archivedStatus = String(doc.status || 'ERROR');
    const common = {
      fullNumber: String(doc.fullNumber),
      issueDate: new Date(String(doc.issueDate)),
      currency: String(doc.currency || 'PEN'),
      customerDocType: String(doc.customerDocType || 'OTHER') as any,
      customerDocNumber: String(doc.customerDocNumber || '-'),
      customerName: String(doc.customerName || 'CLIENTES VARIOS'),
      customerAddress: text(doc.customerAddress),
      taxable: String(doc.taxable || '0'),
      igv: String(doc.igv || '0'),
      total: String(doc.total || '0'),
      status: archivedStatus as any,
      hash: text(doc.hash),
      qrText: text(doc.qrText),
      xmlSigned: text(doc.xmlSigned),
      cdrZip: text(doc.cdrZip),
      sunatTicket: text(doc.sunatTicket),
      sunatCode: text(doc.sunatCode),
      sunatMessage: text(doc.sunatMessage),
      sunatResponseAt: doc.sunatResponseAt ? new Date(String(doc.sunatResponseAt)) : null,
      reportedInSummary: Boolean(doc.reportedInSummary),
      voidReason: text(doc.voidReason),
      zipSentBase64: text(doc.zipSentBase64),
      saleId: saleByNumber.get(Number(doc.saleNumber)) || null,
    };
    if (!existing) {
      const createdDoc = await tx.electronicDocument.create({
        data: {
          storeId,
          docType: doc.docType as any,
          series: String(doc.series),
          number: Number(doc.number),
          ...common,
        },
      });
      sourceIdToNewId.set(doc.id, createdDoc.id);
      created++;
    } else {
      sourceIdToNewId.set(doc.id, existing.id);
      if ((STATUS_RANK[archivedStatus] ?? 0) >= (STATUS_RANK[existing.status] ?? 0)) {
        await tx.electronicDocument.update({ where: { id: existing.id }, data: common });
        updated++;
      }
    }
  }

  for (const doc of archivedDocs) {
    const restoredId = sourceIdToNewId.get(doc.id);
    const referenceId = typeof doc.referenceDocId === 'string' ? sourceIdToNewId.get(doc.referenceDocId) : undefined;
    if (restoredId && referenceId) {
      await tx.electronicDocument.update({ where: { id: restoredId }, data: { referenceDocId: referenceId } });
    }
  }

  return { created, updated, skipped: archivedDocs.length - created - updated };
}
