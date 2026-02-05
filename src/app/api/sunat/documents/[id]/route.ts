/**
 * MÓDULO 18.10 — GET /api/sunat/documents/:id
 * 
 * Obtiene detalle completo de un documento electrónico,
 * incluyendo historial de jobs (últimos 10).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/auditLog';
import { isSuperAdmin } from '@/lib/superadmin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 2. Verificar permisos (OWNER o SUPERADMIN)
    const isSuper = isSuperAdmin(user.email);
    if (user.role !== 'OWNER' && !isSuper) {
      return NextResponse.json(
        { error: 'No tienes permisos para ver documentos electrónicos' },
        { status: 403 }
      );
    }

    // 3. Verificar feature flag
    if (process.env.ENABLE_SUNAT !== 'true') {
      return NextResponse.json(
        { error: 'FEATURE_DISABLED', message: 'SUNAT no está habilitado' },
        { status: 403 }
      );
    }

    // 4. Buscar documento con jobs
    const doc = await prisma.electronicDocument.findUnique({
      where: { id: documentId },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            ruc: true,
          },
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            total: true,
            createdAt: true,
          },
        },
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            status: true,
            attempts: true,
            lastError: true,
            createdAt: true,
            completedAt: true,
          },
        },
        referenceDoc: {
          select: {
            id: true,
            fullNumber: true,
            docType: true,
          },
        },
      },
    });

    if (!doc) {
      return NextResponse.json(
        { error: 'Documento no encontrado' },
        { status: 404 }
      );
    }

    // 5. Verificar permisos por tienda
    if (!isSuper && doc.storeId !== user.storeId) {
      return NextResponse.json(
        { error: 'No tienes acceso a este documento' },
        { status: 403 }
      );
    }

    // 6. Preparar respuesta (sin XML completo)
    const response = {
      id: doc.id,
      storeId: doc.storeId,
      storeName: doc.store.name,
      storeRuc: doc.store.ruc,
      
      // Identificación
      docType: doc.docType,
      series: doc.series,
      number: doc.number,
      fullNumber: doc.fullNumber,
      issueDate: doc.issueDate,
      currency: doc.currency,
      
      // Cliente
      customerDocType: doc.customerDocType,
      customerDocNumber: doc.customerDocNumber,
      customerName: doc.customerName,
      customerAddress: doc.customerAddress,
      
      // Totales
      taxable: doc.taxable,
      igv: doc.igv,
      total: doc.total,
      
      // Estado SUNAT
      status: doc.status,
      hash: doc.hash,
      qrText: doc.qrText,
      sunatCode: doc.sunatCode,
      sunatMessage: doc.sunatMessage,
      sunatResponseAt: doc.sunatResponseAt,
      // Enmascarar ticket
      ticketMasked: doc.sunatTicket
        ? '****' + doc.sunatTicket.slice(-4)
        : null,
      
      // Archivos disponibles
      hasXmlSigned: !!doc.xmlSigned,
      hasCdr: !!doc.cdrZip,
      
      // Summary/Voided
      reportedInSummary: doc.reportedInSummary,
      voidReason: doc.voidReason,
      referenceDoc: doc.referenceDoc
        ? {
            id: doc.referenceDoc.id,
            fullNumber: doc.referenceDoc.fullNumber,
            docType: doc.referenceDoc.docType,
          }
        : null,
      
      // Venta asociada
      sale: doc.sale
        ? {
            id: doc.sale.id,
            saleNumber: doc.sale.saleNumber,
            total: doc.sale.total,
            createdAt: doc.sale.createdAt,
          }
        : null,
      
      // Historial de jobs
      jobs: doc.jobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      })),
      
      // Timestamps
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };

    // 7. Auditoría
    await logAudit({
      storeId: doc.storeId,
      userId: user.userId,
      action: 'SUNAT_DOC_DETAIL_VIEWED',
      entityType: 'SUNAT',
      entityId: doc.id,
      severity: 'INFO',
      meta: {
        fullNumber: doc.fullNumber,
        docType: doc.docType,
        status: doc.status,
      },
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error getting SUNAT document:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
