/**
 * MÓDULO 18.6 — POST /api/sunat/summary/run
 * 
 * Genera y envía el Resumen Diario (RC) de boletas para una fecha específica.
 * 
 * FLUJO:
 * 1. Validar permisos (solo OWNER/SUPERADMIN)
 * 2. Validar que SUNAT esté habilitado para la tienda
 * 3. Buscar boletas ACCEPTED del día que no están reportadas
 * 4. Generar documento ElectronicDocument tipo SUMMARY
 * 5. Generar XML, firmarlo
 * 6. Encolar job SEND_SUMMARY
 * 
 * IMPORTANTE:
 * - Solo incluye boletas (docType=BOLETA) ACCEPTED del día
 * - Máximo 500 documentos por resumen (SUNAT limit)
 * - No incluye boletas ya reportadas (reportedInSummary=true)
 * - Se puede ejecutar múltiples veces para un mismo día si hay más boletas
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { generateSummaryXML, getSummaryFilename, validateSummaryPayload } from '@/lib/sunat/ubl/summary';
import type { SummaryPayload, SummaryDocumentLine } from '@/lib/sunat/ubl/summary';
import { signXml, SignatureError } from '@/lib/sunat/sign/signXmlCrypto';
import { loadCertificate, CertificateError } from '@/lib/sunat/cert/loadCertificate';
import { startOfDay, endOfDay, format } from 'date-fns';
import { logAudit } from '@/lib/auditLog';

// Máximo de documentos por resumen (límite SUNAT)
const MAX_DOCS_PER_SUMMARY = 500;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Solo OWNER puede ejecutar el resumen
    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo OWNER puede ejecutar el Resumen Diario' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { referenceDate } = body; // Fecha de las boletas a incluir (YYYY-MM-DD)

    if (!referenceDate) {
      return NextResponse.json(
        { error: 'Falta referenceDate (fecha de las boletas a reportar, formato YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const storeId = user.storeId;
    if (!storeId) {
      return NextResponse.json({ error: 'Usuario sin tienda asignada' }, { status: 400 });
    }

    // 1. Verificar configuración SUNAT
    const settings = await prisma.sunatSettings.findUnique({
      where: { storeId },
    });

    if (!settings || !settings.enabled) {
      return NextResponse.json(
        { error: 'SUNAT no está habilitado para esta tienda' },
        { status: 400 }
      );
    }

    // Validar credenciales
    if (!settings.solUser || !settings.solPass) {
      return NextResponse.json(
        { error: 'Credenciales SOL no configuradas' },
        { status: 400 }
      );
    }

    // Solo BETA por ahora (MÓDULO 18.6)
    if (settings.env !== 'BETA') {
      return NextResponse.json(
        { error: 'PROD no permitido aún. Solo BETA está habilitado (MÓDULO 18.7)' },
        { status: 400 }
      );
    }

    // 2. Buscar boletas ACCEPTED del día que no están reportadas
    const refDate = new Date(referenceDate);
    const dayStart = startOfDay(refDate);
    const dayEnd = endOfDay(refDate);

    const boletas = await prisma.electronicDocument.findMany({
      where: {
        storeId,
        docType: 'BOLETA',
        status: 'ACCEPTED',
        reportedInSummary: false,
        issueDate: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      take: MAX_DOCS_PER_SUMMARY,
      orderBy: { number: 'asc' },
    });

    if (boletas.length === 0) {
      return NextResponse.json(
        { 
          message: 'No hay boletas pendientes de reportar para la fecha indicada',
          referenceDate,
          count: 0,
        },
        { status: 200 }
      );
    }

    // 3. Obtener siguiente número de resumen
    const nextNumber = settings.nextSummaryNumber || 1;
    const series = settings.defaultSummarySeries || 'RC01';

    // 4. Construir payload del resumen
    const lines: SummaryDocumentLine[] = boletas.map(boleta => ({
      documentId: boleta.id,
      series: boleta.series,
      number: boleta.number,
      docType: 'BOLETA',
      customerDocType: boleta.customerDocType,
      customerDocNumber: boleta.customerDocNumber,
      taxable: Number(boleta.taxable),
      igv: Number(boleta.igv),
      total: Number(boleta.total),
      currency: boleta.currency,
      status: '1', // Adicionar
    }));

    const summaryPayload: SummaryPayload = {
      issuer: {
        ruc: settings.ruc!,
        razonSocial: settings.razonSocial!,
      },
      referenceDate: refDate,
      issueDate: new Date(),
      series,
      number: nextNumber,
      lines,
    };

    // 5. Validar payload
    const validation = validateSummaryPayload(summaryPayload);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Payload inválido', errors: validation.errors },
        { status: 400 }
      );
    }

    // 6. Generar XML
    const docId = `Sign-${settings.ruc}-${series}-${nextNumber}`;
    const xmlUnsigned = generateSummaryXML(summaryPayload, docId);

    // 7. Cargar certificado y firmar XML
    let cert;
    try {
      cert = await loadCertificate(prisma as any, storeId);
    } catch (error) {
      if (error instanceof CertificateError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 409 }
        );
      }
      throw error;
    }

    let signResult;
    try {
      signResult = signXml(xmlUnsigned, cert, docId);
    } catch (error) {
      if (error instanceof SignatureError) {
        return NextResponse.json(
          { error: `Error al firmar: ${error.message}`, code: error.code },
          { status: 500 }
        );
      }
      throw error;
    }

    // 8. Crear documento SUMMARY
    const totals = lines.reduce(
      (acc, line) => ({
        taxable: acc.taxable + line.taxable,
        igv: acc.igv + line.igv,
        total: acc.total + line.total,
      }),
      { taxable: 0, igv: 0, total: 0 }
    );

    const fullNumber = getSummaryFilename(settings.ruc!, series, nextNumber, refDate);

    const summaryDoc = await prisma.electronicDocument.create({
      data: {
        storeId,
        docType: 'SUMMARY',
        series,
        number: nextNumber,
        fullNumber,
        issueDate: new Date(),
        currency: 'PEN',
        customerDocType: 'OTHER',
        customerDocNumber: '-',
        customerName: 'VARIOS',
        taxable: totals.taxable,
        igv: totals.igv,
        total: totals.total,
        status: 'SIGNED',
        xmlSigned: signResult.signedXml,
        hash: signResult.digestValue,
        // Guardar IDs de boletas incluidas para marcarlas después
        voidReason: JSON.stringify(boletas.map(b => b.id)),
      },
    });

    // 9. Actualizar correlativo del resumen
    await prisma.sunatSettings.update({
      where: { storeId },
      data: { nextSummaryNumber: nextNumber + 1 },
    });

    // 10. Encolar job SEND_SUMMARY
    const job = await prisma.sunatJob.create({
      data: {
        storeId,
        documentId: summaryDoc.id,
        type: 'SEND_SUMMARY',
        status: 'QUEUED',
        nextRunAt: new Date(), // Ejecutar inmediatamente
      },
    });

    // 11. Auditar
    await logAudit({
      action: 'SUNAT_SUMMARY_CREATED',
      entityType: 'SUNAT',
      entityId: summaryDoc.id,
      storeId,
      userId: user.userId,
      severity: 'INFO',
      meta: {
        referenceDate,
        boletasCount: boletas.length,
        series,
        number: nextNumber,
        jobId: job.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Resumen Diario creado con ${boletas.length} boletas`,
      summary: {
        id: summaryDoc.id,
        fullNumber,
        referenceDate: format(refDate, 'yyyy-MM-dd'),
        boletasCount: boletas.length,
        totalAmount: totals.total.toFixed(2),
        status: 'SIGNED',
        jobId: job.id,
      },
    });

  } catch (error: any) {
    console.error('Error en POST /api/sunat/summary/run:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sunat/summary/run
 * 
 * Retorna boletas pendientes de reportar para una fecha específica.
 * Útil para previsualizar antes de ejecutar el resumen.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const storeId = user.storeId;
    if (!storeId) {
      return NextResponse.json({ error: 'Usuario sin tienda asignada' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const referenceDate = searchParams.get('referenceDate');

    if (!referenceDate) {
      return NextResponse.json(
        { error: 'Falta parámetro referenceDate (formato YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const refDate = new Date(referenceDate);
    const dayStart = startOfDay(refDate);
    const dayEnd = endOfDay(refDate);

    // Buscar boletas pendientes
    const boletas = await prisma.electronicDocument.findMany({
      where: {
        storeId,
        docType: 'BOLETA',
        status: 'ACCEPTED',
        reportedInSummary: false,
        issueDate: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      select: {
        id: true,
        series: true,
        number: true,
        fullNumber: true,
        total: true,
        customerName: true,
        issueDate: true,
      },
      orderBy: { number: 'asc' },
    });

    return NextResponse.json({
      referenceDate,
      pendingCount: boletas.length,
      maxPerSummary: MAX_DOCS_PER_SUMMARY,
      boletas: boletas.map(b => ({
        id: b.id,
        fullNumber: b.fullNumber,
        total: Number(b.total).toFixed(2),
        customerName: b.customerName,
        issueDate: b.issueDate,
      })),
    });

  } catch (error: any) {
    console.error('Error en GET /api/sunat/summary/run:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
