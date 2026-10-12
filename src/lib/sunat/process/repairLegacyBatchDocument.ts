import type { PrismaClient } from '@prisma/client';
import { loadCertificate } from '../cert/loadCertificate';
import { signXml } from '../sign/signXmlCrypto';
import {
  generateSummaryXML,
  getSummaryFilename,
  SUMMARY_SERIES,
  type SummaryDocumentLine,
  type SummaryPayload,
} from '../ubl/summary';
import {
  generateVoidedXML,
  getVoidedFilename,
  mapDocTypeToCode,
  VOIDED_SERIES,
  type VoidedDocumentLine,
  type VoidedPayload,
} from '../ubl/voided';

type PrismaLike = PrismaClient | any;

export interface LegacyBatchRepairResult {
  document: any;
  repaired: boolean;
}

function parseStoredDocumentIds(document: any): { ids: string[]; reason?: string } {
  const parsed = JSON.parse(document.voidReason || (document.docType === 'SUMMARY' ? '[]' : '{}'));
  if (document.docType === 'SUMMARY' && Array.isArray(parsed)) {
    return { ids: parsed.filter((id): id is string => typeof id === 'string') };
  }
  if (document.docType === 'VOIDED' && parsed?.kind === 'VOIDED' && Array.isArray(parsed.documentIds)) {
    return {
      ids: parsed.documentIds.filter((id: unknown): id is string => typeof id === 'string'),
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'ANULACION DE LA OPERACION',
    };
  }
  throw new Error(`El documento ${document.fullNumber} no conserva sus documentos de origen`);
}

function dateFromLegacyFilename(fullNumber: string, prefix: 'RC01' | 'RA01'): Date | null {
  const match = fullNumber.match(new RegExp(`-${prefix}-(\\d{4})(\\d{2})(\\d{2})-\\d{1,5}$`));
  if (!match) return null;
  const value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isLegacyBatchName(document: any): boolean {
  return (
    (document.docType === 'SUMMARY' && (document.series === 'RC01' || document.fullNumber?.includes('-RC01-'))) ||
    (document.docType === 'VOIDED' && (document.series === 'RA01' || document.fullNumber?.includes('-RA01-')))
  );
}

function needsSummaryChargeIndicatorRepair(document: any): boolean {
  return document.docType === 'SUMMARY'
    && !document.sunatTicket
    && typeof document.xmlSigned === 'string'
    && document.xmlSigned.includes('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
}

/**
 * Rehace los lotes creados por versiones que usaban RC01/RA01. Es seguro porque
 * esos nombres no son validos para SUNAT y solo se repara cuando no existe ticket.
 */
export async function repairLegacyBatchDocument(
  prisma: PrismaLike,
  job: any,
  document: any,
  settings: any,
): Promise<LegacyBatchRepairResult> {
  const needsNameRepair = isLegacyBatchName(document);
  const needsChargeIndicatorRepair = needsSummaryChargeIndicatorRepair(document);
  if ((!needsNameRepair && !needsChargeIndicatorRepair) || document.sunatTicket) {
    return { document, repaired: false };
  }
  if (!['SUMMARY', 'VOIDED'].includes(document.docType)) {
    return { document, repaired: false };
  }

  const stored = parseStoredDocumentIds(document);
  if (stored.ids.length === 0) {
    throw new Error(`No se puede reparar ${document.fullNumber}: no conserva documentos de origen`);
  }

  const sourceDocuments = await prisma.electronicDocument.findMany({
    where: { id: { in: stored.ids }, storeId: document.storeId },
  });
  const byId = new Map(sourceDocuments.map((source: any) => [source.id, source]));
  const orderedSources = stored.ids.map((id) => byId.get(id)).filter(Boolean);
  if (orderedSources.length !== stored.ids.length) {
    throw new Error(`No se puede reparar ${document.fullNumber}: faltan documentos de origen`);
  }
  if (!settings.ruc || !settings.razonSocial) {
    throw new Error('Faltan los datos fiscales del emisor para reconstruir el documento');
  }

  const certificate = await loadCertificate(prisma as PrismaClient, document.storeId);
  let series: string;
  let fullNumber: string;
  let signedXml: string;
  let digestValue: string;

  if (document.docType === 'SUMMARY') {
    series = SUMMARY_SERIES;
    const referenceDate = dateFromLegacyFilename(document.fullNumber, 'RC01') || orderedSources[0].issueDate;
    const lines: SummaryDocumentLine[] = orderedSources.map((source: any) => ({
      documentId: source.id,
      series: source.series,
      number: source.number,
      docType: source.docType,
      customerDocType: source.customerDocType,
      customerDocNumber: source.customerDocNumber,
      taxable: Number(source.taxable),
      igv: Number(source.igv),
      total: Number(source.total),
      currency: source.currency,
      status: '1',
    }));
    const payload: SummaryPayload = {
      issuer: { ruc: settings.ruc, razonSocial: settings.razonSocial },
      referenceDate,
      issueDate: document.issueDate,
      series,
      number: document.number,
      lines,
    };
    const docId = `Sign-${settings.ruc}-${series}-${document.number}`;
    const signature = signXml(generateSummaryXML(payload, docId), certificate, docId);
    signedXml = signature.signedXml;
    digestValue = signature.digestValue;
    fullNumber = getSummaryFilename(settings.ruc, series, document.number, referenceDate);
  } else {
    series = VOIDED_SERIES;
    const issueDate = dateFromLegacyFilename(document.fullNumber, 'RA01') || document.issueDate;
    const lines: VoidedDocumentLine[] = orderedSources.map((source: any) => ({
      documentId: source.id,
      documentTypeCode: mapDocTypeToCode(source.docType),
      series: source.series,
      number: source.number,
      voidReason: stored.reason || 'ANULACION DE LA OPERACION',
    }));
    const payload: VoidedPayload = {
      issuer: { ruc: settings.ruc, razonSocial: settings.razonSocial },
      issueDate,
      referenceDate: orderedSources[0].issueDate,
      series,
      number: document.number,
      lines,
    };
    const docId = `Sign-${settings.ruc}-${series}-${document.number}`;
    const signature = signXml(generateVoidedXML(payload, docId), certificate, docId);
    signedXml = signature.signedXml;
    digestValue = signature.digestValue;
    fullNumber = getVoidedFilename(settings.ruc, series, document.number, issueDate);
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.electronicDocument.update({
      where: { id: document.id },
      data: {
        series,
        fullNumber,
        xmlSigned: signedXml,
        hash: digestValue,
        zipSentBase64: null,
        sunatCode: null,
        sunatMessage: null,
        sunatResponseAt: null,
      },
    });
    await tx.sunatSettings.update({
      where: { storeId: document.storeId },
      data: document.docType === 'SUMMARY'
        ? { defaultSummarySeries: SUMMARY_SERIES }
        : { defaultVoidedSeries: VOIDED_SERIES },
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
      series,
      fullNumber,
      xmlSigned: signedXml,
      hash: digestValue,
      zipSentBase64: null,
      sunatCode: null,
      sunatMessage: null,
      sunatResponseAt: null,
    },
  };
}
