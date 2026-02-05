/**
 * MÓDULO 18.5 — GET /api/sunat/by-sale/:saleId
 * 
 * Obtiene el documento electrónico asociado a una venta.
 * Útil para mostrar estado SUNAT en el historial de ventas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/superadmin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  try {
    const { saleId } = await params;

    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // 2. Buscar venta con documento electrónico
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        electronicDocuments: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    // 3. Verificar permisos
    const isSuper = isSuperAdmin(user.email);
    if (!isSuper && sale.storeId !== user.storeId) {
      return NextResponse.json(
        { error: 'No tienes acceso a esta venta' },
        { status: 403 }
      );
    }

    // 4. Si no tiene documento electrónico
    if (!sale.electronicDocuments || sale.electronicDocuments.length === 0) {
      return NextResponse.json({
        hasDocument: false,
        saleId: sale.id,
      });
    }

    const doc = sale.electronicDocuments[0];

    // 5. Buscar último job asociado (opcional, para mostrar detalles)
    const lastJob = await prisma.sunatJob.findFirst({
      where: {
        documentId: doc.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 6. Respuesta
    return NextResponse.json({
      hasDocument: true,
      document: {
        id: doc.id,
        docType: doc.docType,
        series: doc.series,
        number: doc.number,
        fullNumber: doc.fullNumber,
        status: doc.status,
        issueDate: doc.issueDate,
        currency: doc.currency,
        total: doc.total,
        customerDocType: doc.customerDocType,
        customerDocNumber: doc.customerDocNumber,
        customerName: doc.customerName,
        sunatCode: doc.sunatCode,
        sunatMessage: doc.sunatMessage,
        sunatResponseAt: doc.sunatResponseAt,
        hasCdr: !!doc.cdrZip,
        hasXml: !!doc.xmlSigned,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      job: lastJob ? {
        id: lastJob.id,
        status: lastJob.status,
        type: lastJob.type,
        attempts: lastJob.attempts,
        lastError: lastJob.lastError,
        nextRunAt: lastJob.nextRunAt,
      } : null,
    });

  } catch (error: any) {
    console.error('Error en GET /api/sunat/by-sale/:saleId:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
