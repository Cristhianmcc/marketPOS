import { NextRequest, NextResponse } from 'next/server';
import type { SunatDocType } from '@prisma/client';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { buildPayloadFromDocument } from '@/lib/sunat/buildPayloadFromDocument';
import { generateCreditNoteXML } from '@/lib/sunat/ubl/creditNote';
import { generateDebitNoteXML } from '@/lib/sunat/ubl/debitNote';
import { getNextSunatNumber, generateFullNumber } from '@/domain/sunat/correlatives';
import { loadCertificate } from '@/lib/sunat/cert/loadCertificate';
import { signXml, calculateXmlHash, verifyXmlSignature } from '@/lib/sunat/sign/signXmlCrypto';
import { buildSunatQrText } from '@/lib/sunat/qr';
import { serializeAdjustmentMetadata } from '@/lib/sunat/adjustmentMetadata';
import { logAudit } from '@/lib/auditLog';

const CREDIT_CODES = new Set(['01', '02', '03', '04', '05', '06', '07', '08', '09']);
const DEBIT_CODES = new Set(['01', '02', '03', '10']);

function noteSeries(referenceType: 'FACTURA' | 'BOLETA', noteType: 'NOTA_CREDITO' | 'NOTA_DEBITO', configured: string): string {
  const expectedPrefix = referenceType === 'FACTURA' ? 'F' : 'B';
  if (configured?.startsWith(expectedPrefix)) return configured;
  return `${expectedPrefix}${noteType === 'NOTA_CREDITO' ? 'C' : 'D'}01`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.storeId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Solo el OWNER puede emitir notas electrónicas' }, { status: 403 });
    }

    const body = await req.json();
    const referenceDocumentId = String(body.referenceDocumentId || '');
    const noteType = String(body.noteType || '') as 'NOTA_CREDITO' | 'NOTA_DEBITO';
    const reasonCode = String(body.reasonCode || '').padStart(2, '0');
    const reason = String(body.reason || '').trim();
    const amount = Number(body.amount);
    const cancelSaleOnAcceptance = body.cancelSaleOnAcceptance === true;

    if (!referenceDocumentId || !['NOTA_CREDITO', 'NOTA_DEBITO'].includes(noteType)) {
      return NextResponse.json({ error: 'Documento de referencia y tipo de nota son obligatorios' }, { status: 400 });
    }
    if (reason.length < 3) return NextResponse.json({ error: 'Indica un motivo de al menos 3 caracteres' }, { status: 400 });
    if (!(noteType === 'NOTA_CREDITO' ? CREDIT_CODES : DEBIT_CODES).has(reasonCode)) {
      return NextResponse.json({ error: 'Código de motivo SUNAT no válido para este tipo de nota' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'El importe de la nota debe ser mayor que cero' }, { status: 400 });
    }

    const reference = await prisma.electronicDocument.findFirst({
      where: { id: referenceDocumentId, storeId: user.storeId },
      include: { sunatSettings: true },
    });
    if (!reference || !['FACTURA', 'BOLETA'].includes(reference.docType)) {
      return NextResponse.json({ error: 'El comprobante original no existe o no admite notas' }, { status: 404 });
    }
    if (!['ACCEPTED', 'OBSERVED'].includes(reference.status)) {
      return NextResponse.json({ error: 'El comprobante original debe estar aceptado por SUNAT' }, { status: 409 });
    }
    if (!reference.sunatSettings.enabled) {
      return NextResponse.json({ error: 'SUNAT está desactivado para la tienda' }, { status: 409 });
    }
    if (noteType === 'NOTA_CREDITO' && amount > Number(reference.total) + 0.001) {
      return NextResponse.json({ error: 'La nota de crédito no puede superar el total del comprobante original' }, { status: 400 });
    }
    if (cancelSaleOnAcceptance && (noteType !== 'NOTA_CREDITO' || Math.abs(amount - Number(reference.total)) > 0.001)) {
      return NextResponse.json({ error: 'La anulación de venta requiere una nota de crédito por el total' }, { status: 400 });
    }

    const metadata = serializeAdjustmentMetadata({
      kind: 'ADJUSTMENT',
      reasonCode,
      reason,
      referenceDocType: reference.docType as 'FACTURA' | 'BOLETA',
      referenceDocNumber: reference.fullNumber,
      amount,
      cancelSaleOnAcceptance,
    });

    const duplicate = await prisma.electronicDocument.findFirst({
      where: {
        storeId: user.storeId,
        referenceDocId: reference.id,
        docType: noteType,
        voidReason: metadata,
        status: { in: ['SIGNED', 'SENT', 'ACCEPTED', 'OBSERVED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (duplicate) {
      return NextResponse.json({ success: true, idempotent: true, document: duplicate });
    }

    const basePayload = await buildPayloadFromDocument(prisma, reference.id);
    const isFullCredit = noteType === 'NOTA_CREDITO' && Math.abs(amount - Number(reference.total)) < 0.001;
    const taxable = isFullCredit
      ? Number(reference.taxable)
      : Number((amount / 1.18).toFixed(2));
    const igv = isFullCredit
      ? Number(reference.igv)
      : Number((amount - taxable).toFixed(2));
    const payload = {
      ...basePayload,
      items: isFullCredit ? basePayload.items : [{
        lineNumber: 1,
        description: reason,
        quantity: 1,
        unitPrice: amount,
        lineSubtotal: amount,
        taxableAmount: taxable,
        taxAmount: igv,
        unitValue: taxable,
        unitSunatCode: 'NIU',
      }],
      totals: { subtotal: taxable, tax: igv, total: amount, currency: 'PEN' as const },
    };

    const fiscalType = noteType as SunatDocType;
    const issueDate = new Date();
    const document = await prisma.$transaction(async (tx) => {
      const number = await getNextSunatNumber(tx, user.storeId!, fiscalType);
      const configured = noteType === 'NOTA_CREDITO'
        ? reference.sunatSettings.defaultNcSeries
        : reference.sunatSettings.defaultNdSeries;
      const series = noteSeries(reference.docType as 'FACTURA' | 'BOLETA', noteType, configured);
      return tx.electronicDocument.create({
        data: {
          storeId: user.storeId!,
          saleId: reference.saleId,
          docType: fiscalType,
          series,
          number,
          fullNumber: generateFullNumber(series, number),
          issueDate,
          currency: reference.currency,
          customerDocType: reference.customerDocType,
          customerDocNumber: reference.customerDocNumber,
          customerName: reference.customerName,
          customerAddress: reference.customerAddress,
          taxable,
          igv,
          total: amount,
          status: 'DRAFT',
          referenceDocId: reference.id,
          voidReason: metadata,
        },
      });
    });

    payload.metadata = {
      ...payload.metadata,
      docType: fiscalType,
      documentId: document.id,
      series: document.series,
      number: document.number,
      fullNumber: document.fullNumber,
      issueDate,
    };

    let signedXml: string;
    let hash: string;
    let qrText: string;
    try {
      const unsignedXml = noteType === 'NOTA_CREDITO'
        ? generateCreditNoteXML(payload, document.id, {
          referencedDocType: reference.docType,
          referencedDocNumber: reference.fullNumber,
          creditNoteTypeCode: reasonCode,
          creditNoteReason: reason,
        })
        : generateDebitNoteXML(payload, document.id, {
          referencedDocType: reference.docType,
          referencedDocNumber: reference.fullNumber,
          debitNoteTypeCode: reasonCode,
          debitNoteReason: reason,
        });
      const certificate = await loadCertificate(prisma, user.storeId);
      const signed = signXml(unsignedXml, certificate, document.id);
      if (!verifyXmlSignature(signed.signedXml, certificate)) throw new Error('La firma XML de la nota no pudo verificarse');
      signedXml = signed.signedXml;
      hash = calculateXmlHash(signedXml);
      qrText = buildSunatQrText({
        issuerRuc: payload.issuer.ruc,
        docType: fiscalType,
        series: document.series,
        number: document.number,
        igv,
        total: amount,
        issueDate,
        customerDocType: reference.customerDocType,
        customerDocNumber: reference.customerDocNumber,
        hash,
      });
    } catch (signingError) {
      await prisma.electronicDocument.update({
        where: { id: document.id },
        data: {
          status: 'ERROR',
          sunatMessage: signingError instanceof Error ? signingError.message : 'No se pudo firmar la nota',
        },
      });
      throw signingError;
    }

    const [, job] = await prisma.$transaction([
      prisma.electronicDocument.update({
        where: { id: document.id },
        data: { status: 'SIGNED', xmlSigned: signedXml, hash, qrText },
      }),
      prisma.sunatJob.create({
        data: {
          storeId: user.storeId,
          documentId: document.id,
          type: 'SEND_CPE',
          status: 'QUEUED',
          nextRunAt: new Date(),
        },
      }),
    ]);

    await logAudit({
      action: 'SUNAT_ADJUSTMENT_CREATED',
      entityType: 'SUNAT',
      entityId: document.id,
      storeId: user.storeId,
      userId: user.userId,
      severity: 'WARN',
      meta: { noteType, reasonCode, reference: reference.fullNumber, amount, jobId: job.id },
    });

    return NextResponse.json({
      success: true,
      document: { id: document.id, fullNumber: document.fullNumber, status: 'SIGNED' },
      jobId: job.id,
    });
  } catch (error) {
    console.error('Error al crear nota SUNAT:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error al crear nota SUNAT' }, { status: 500 });
  }
}
