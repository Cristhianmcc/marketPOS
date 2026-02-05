/**
 * MÓDULO 18.6 — POST /api/sunat/void
 * 
 * Genera y envía una Comunicación de Baja (RA) para anular documentos electrónicos.
 * 
 * FLUJO:
 * 1. Validar permisos (solo OWNER/SUPERADMIN)
 * 2. Validar que SUNAT esté habilitado
 * 3. Buscar documento(s) a anular
 * 4. Validar que se puedan anular (ACCEPTED, no anulados antes)
 * 5. Generar documento ElectronicDocument tipo VOIDED
 * 6. Generar XML, firmarlo
 * 7. Encolar job SEND_SUMMARY (usa mismo servicio de SUNAT)
 * 
 * IMPORTANTE:
 * - Solo documentos ACCEPTED pueden ser anulados
 * - La baja es un "proceso fiscal paralelo", la venta local NO se afecta
 * - El documento original pasa a status CANCELED cuando la baja es aceptada
 * - Se puede anular FACTURAS, BOLETAS, NC y ND
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { generateVoidedXML, getVoidedFilename, validateVoidedPayload, mapDocTypeToCode } from '@/lib/sunat/ubl/voided';
import type { VoidedPayload, VoidedDocumentLine } from '@/lib/sunat/ubl/voided';
import { signXml, SignatureError } from '@/lib/sunat/sign/signXmlCrypto';
import { loadCertificate, CertificateError } from '@/lib/sunat/cert/loadCertificate';
import { logAudit } from '@/lib/auditLog';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Solo OWNER puede dar de baja
    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo OWNER puede dar de baja documentos fiscales' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { documentIds, voidReason } = body;

    // Validar parámetros
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: 'documentIds debe ser un array con al menos un documento' },
        { status: 400 }
      );
    }

    if (!voidReason || voidReason.length < 3) {
      return NextResponse.json(
        { error: 'voidReason requerido (mínimo 3 caracteres)' },
        { status: 400 }
      );
    }

    if (documentIds.length > 500) {
      return NextResponse.json(
        { error: 'Máximo 500 documentos por comunicación de baja' },
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

    // Solo BETA por ahora
    if (settings.env !== 'BETA') {
      return NextResponse.json(
        { error: 'PROD no permitido aún. Solo BETA está habilitado (MÓDULO 18.7)' },
        { status: 400 }
      );
    }

    // 2. Buscar documentos a anular
    const documents = await prisma.electronicDocument.findMany({
      where: {
        id: { in: documentIds },
        storeId,
      },
    });

    if (documents.length !== documentIds.length) {
      return NextResponse.json(
        { error: 'Algunos documentos no fueron encontrados o no pertenecen a esta tienda' },
        { status: 404 }
      );
    }

    // 3. Validar que todos puedan ser anulados
    const errors: string[] = [];
    for (const doc of documents) {
      if (doc.status !== 'ACCEPTED') {
        errors.push(`${doc.fullNumber}: Solo documentos ACCEPTED pueden anularse (actual: ${doc.status})`);
      }
      if (doc.docType === 'SUMMARY' || doc.docType === 'VOIDED') {
        errors.push(`${doc.fullNumber}: No se puede anular un ${doc.docType}`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Algunos documentos no pueden ser anulados', details: errors },
        { status: 400 }
      );
    }

    // 4. Obtener siguiente número de baja
    const nextNumber = settings.nextVoidedNumber || 1;
    const series = settings.defaultVoidedSeries || 'RA01';
    const issueDate = new Date();

    // La fecha de referencia es la fecha de emisión de los documentos
    // SUNAT requiere que sea la misma para todos los documentos en una baja
    // Por simplicidad, usamos la fecha del primer documento
    const referenceDate = documents[0].issueDate;

    // 5. Construir payload de la baja
    const lines: VoidedDocumentLine[] = documents.map(doc => ({
      documentId: doc.id,
      documentTypeCode: mapDocTypeToCode(doc.docType),
      series: doc.series,
      number: doc.number,
      voidReason,
    }));

    const voidedPayload: VoidedPayload = {
      issuer: {
        ruc: settings.ruc!,
        razonSocial: settings.razonSocial!,
      },
      issueDate,
      referenceDate,
      series,
      number: nextNumber,
      lines,
    };

    // 6. Validar payload
    const validation = validateVoidedPayload(voidedPayload);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Payload inválido', errors: validation.errors },
        { status: 400 }
      );
    }

    // 7. Generar XML
    const docId = `Sign-${settings.ruc}-${series}-${nextNumber}`;
    const xmlUnsigned = generateVoidedXML(voidedPayload, docId);

    // 8. Cargar certificado y firmar XML
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

    // 9. Crear documento VOIDED
    const fullNumber = getVoidedFilename(settings.ruc!, series, nextNumber, issueDate);

    // Calcular totales de los documentos a anular
    const totals = documents.reduce(
      (acc, doc) => ({
        taxable: acc.taxable + Number(doc.taxable),
        igv: acc.igv + Number(doc.igv),
        total: acc.total + Number(doc.total),
      }),
      { taxable: 0, igv: 0, total: 0 }
    );

    const voidedDoc = await prisma.electronicDocument.create({
      data: {
        storeId,
        docType: 'VOIDED',
        series,
        number: nextNumber,
        fullNumber,
        issueDate,
        currency: 'PEN',
        customerDocType: 'OTHER',
        customerDocNumber: '-',
        customerName: 'ANULACIÓN',
        taxable: totals.taxable,
        igv: totals.igv,
        total: totals.total,
        status: 'SIGNED',
        xmlSigned: signResult.signedXml,
        hash: signResult.digestValue,
        voidReason,
        // Guardar IDs de documentos anulados
        referenceDocId: documents[0].id, // Principal (solo uno en relación)
      },
    });

    // 10. Actualizar correlativo de la baja
    await prisma.sunatSettings.update({
      where: { storeId },
      data: { nextVoidedNumber: nextNumber + 1 },
    });

    // 11. Marcar los documentos originales con referencia al voided
    // (se marcarán como CANCELED cuando la baja sea aceptada)
    await prisma.electronicDocument.updateMany({
      where: {
        id: { in: documentIds },
      },
      data: {
        voidReason,
        referenceDocId: voidedDoc.id,
      },
    });

    // 12. Encolar job SEND_SUMMARY (Voided usa mismo servicio sendSummary)
    const job = await prisma.sunatJob.create({
      data: {
        storeId,
        documentId: voidedDoc.id,
        type: 'SEND_SUMMARY', // Voided usa sendSummary también
        status: 'QUEUED',
        nextRunAt: new Date(),
      },
    });

    // 13. Auditar
    await logAudit({
      action: 'SUNAT_VOIDED_CREATED',
      entityType: 'SUNAT',
      entityId: voidedDoc.id,
      storeId,
      userId: user.userId,
      severity: 'WARN',
      meta: {
        documentIds,
        voidReason,
        series,
        number: nextNumber,
        jobId: job.id,
        documentsAffected: documents.map(d => d.fullNumber),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Comunicación de Baja creada para ${documents.length} documento(s)`,
      voided: {
        id: voidedDoc.id,
        fullNumber,
        documentsCount: documents.length,
        documentsAffected: documents.map(d => d.fullNumber),
        voidReason,
        status: 'SIGNED',
        jobId: job.id,
      },
    });

  } catch (error: any) {
    console.error('Error en POST /api/sunat/void:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sunat/void
 * 
 * Lista documentos que pueden ser anulados (ACCEPTED, no anulados antes).
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
    const docType = searchParams.get('docType'); // Filtrar por tipo
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    const where: any = {
      storeId,
      status: 'ACCEPTED',
      // Excluir Summary y Voided
      docType: {
        notIn: ['SUMMARY', 'VOIDED'],
      },
      // Excluir documentos que ya tienen un voided asociado pendiente
      voidReason: null,
    };

    if (docType && ['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO'].includes(docType)) {
      where.docType = docType;
    }

    const [documents, total] = await Promise.all([
      prisma.electronicDocument.findMany({
        where,
        select: {
          id: true,
          docType: true,
          series: true,
          number: true,
          fullNumber: true,
          issueDate: true,
          total: true,
          customerName: true,
          status: true,
        },
        orderBy: { issueDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.electronicDocument.count({ where }),
    ]);

    return NextResponse.json({
      documents: documents.map(d => ({
        id: d.id,
        docType: d.docType,
        fullNumber: d.fullNumber,
        issueDate: d.issueDate,
        total: Number(d.total).toFixed(2),
        customerName: d.customerName,
        status: d.status,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error: any) {
    console.error('Error en GET /api/sunat/void:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
