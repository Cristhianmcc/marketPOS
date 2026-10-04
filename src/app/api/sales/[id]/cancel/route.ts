// app/api/sales/[id]/cancel/route.ts
// Anular ventas con reversión de stock ACID

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { logAudit, getRequestMetadata } from '@/lib/auditLog'; // ✅ MÓDULO 15: Auditoría
import { cancelSaleLocally } from '@/lib/sales/cancelSaleLocally';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: saleId } = await params;
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Buscar venta con items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            storeProduct: {
              include: {
                product: true,
              },
            },
          },
        },
        user: true,
        electronicDocuments: {
          where: { docType: { in: ['FACTURA', 'BOLETA'] } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { code: 'SALE_NOT_FOUND', message: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    // Validar storeId
    if (sale.storeId !== session.storeId) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes acceso a esta venta' },
        { status: 403 }
      );
    }

    // Verificar si ya está anulada
    if (Number(sale.total) === 0 && Number(sale.subtotal) === 0 && Number(sale.tax) === 0) {
      return NextResponse.json(
        { code: 'SALE_ALREADY_CANCELLED', message: 'Esta venta ya está anulada' },
        { status: 409 }
      );
    }

    // VALIDACIÓN DE PERMISOS
    if (session.role === 'CASHIER') {
      // CASHIER solo puede anular su último ticket
      if (sale.userId !== session.userId) {
        return NextResponse.json(
          { code: 'SALE_NOT_ALLOWED', message: 'Solo puedes anular tus propias ventas' },
          { status: 403 }
        );
      }

      // Verificar que sea el último ticket creado por este cajero
      const lastSale = await prisma.sale.findFirst({
        where: {
          storeId: session.storeId,
          userId: session.userId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!lastSale || lastSale.id !== saleId) {
        return NextResponse.json(
          { code: 'SALE_NOT_ALLOWED', message: 'Solo puedes anular tu último ticket' },
          { status: 403 }
        );
      }
    } else if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos para anular ventas' },
        { status: 403 }
      );
    }

    const activeFiscalDocument = sale.electronicDocuments.find((document) =>
      ['SIGNED', 'SENT', 'ACCEPTED', 'OBSERVED'].includes(document.status)
    );
    if (activeFiscalDocument) {
      return NextResponse.json(
        {
          code: 'FISCAL_ADJUSTMENT_REQUIRED',
          message: `La venta tiene el comprobante ${activeFiscalDocument.fullNumber}. Emite una nota de crédito para anularla fiscalmente.`,
          documentId: activeFiscalDocument.id,
          documentStatus: activeFiscalDocument.status,
        },
        { status: 409 }
      );
    }

    const cancellation = await cancelSaleLocally(
      prisma,
      saleId,
      session.userId,
      'Anulación local sin comprobante fiscal vigente'
    );
    const result = { id: saleId };
    if (!cancellation.cancelled) {
      return NextResponse.json(
        { code: 'SALE_ALREADY_CANCELLED', message: 'Esta venta ya está anulada' },
        { status: 409 }
      );
    }

    // ✅ MÓDULO 15: Log de auditoría (fire-and-forget)
    const { ip, userAgent } = getRequestMetadata(request);
    
    await logAudit({
      storeId: session.storeId,
      userId: session.userId,
      action: 'SALE_VOIDED',
      entityType: 'SALE',
      entityId: result.id,
      severity: 'WARN',
      meta: {
        saleNumber: sale.saleNumber,
        voidedBy: session.userId,
        originalTotal: sale.total.toNumber(),
        wasFiado: sale.paymentMethod === 'FIADO',
        hadCoupon: !!sale.couponCode,
        itemsCount: sale.items.length,
      },
      ip,
      userAgent,
    });

    // ✅ MÓDULO 15: Si era FIADO, log adicional de receivable cancelado (fire-and-forget)
    if (sale.paymentMethod === 'FIADO') {
      const cancelledReceivable = await prisma.receivable.findFirst({
        where: { saleId },
      });
      
      if (cancelledReceivable) {
        logAudit({
          storeId: session.storeId,
          userId: session.userId,
          action: 'RECEIVABLE_CANCELLED',
          entityType: 'RECEIVABLE',
          entityId: cancelledReceivable.id,
          severity: 'WARN',
          meta: {
            saleNumber: sale.saleNumber,
            customerId: cancelledReceivable.customerId,
            originalAmount: cancelledReceivable.originalAmount.toNumber(),
            wasBalance: cancelledReceivable.balance.toNumber(),
            reason: 'Sale cancelled',
          },
          ip,
          userAgent,
        }).catch(e => console.error('Audit log failed (non-blocking):', e));
      }
    }

    return NextResponse.json({
      success: true,
      saleId: result.id,
      cancelledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error cancelling sale:', error);
    
    // ✅ MÓDULO 15: Log de fallo (fire-and-forget)
    try {
      const { id: errorSaleId } = await params;
      const { ip, userAgent } = getRequestMetadata(request);
      const sessionData = await getSession();
      
      logAudit({
        storeId: sessionData?.storeId,
        userId: sessionData?.userId,
        action: 'SALE_CANCEL_FAILED',
        entityType: 'SALE',
        entityId: errorSaleId,
        severity: 'ERROR',
        meta: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        ip,
        userAgent,
      }).catch(e => console.error('Audit log failed (non-blocking):', e));
    } catch {}
    
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al anular venta' },
      { status: 500 }
    );
  }
}
