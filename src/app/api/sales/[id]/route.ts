import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStoreUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { buildFiscalTicket } from '@/lib/sunat/printedTicket';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getCurrentStoreUser();
    if (!session) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // ✅ MÓDULO 18.2: Consulta optimizada - No hacer JOINs innecesarios
    // Los datos del producto ya están como snapshot en sale_items
    const sale = await prisma.sale.findUnique({
      where: {
        id,
        storeId: session.storeId,
      },
      select: {
        id: true,
        saleNumber: true,
        subtotal: true,
        tax: true,
        discountTotal: true,
        totalBeforeDiscount: true,
        totalBeforeCoupon: true,
        couponCode: true,
        couponType: true,
        couponValue: true,
        couponDiscount: true,
        total: true,
        paymentMethod: true,
        amountPaid: true,
        changeAmount: true,
        paymentDetails: true, // ✅ Pago Mixto: desglose de splits
        createdAt: true,
        printedAt: true,
        customerId: true,
        userId: true,
        // Items - ya tienen snapshot del producto
        items: {
          select: {
            id: true,
            productName: true,
            productContent: true,
            unitType: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            promotionType: true,
            promotionName: true,
            promotionDiscount: true,
            categoryPromoName: true,
            categoryPromoType: true,
            categoryPromoDiscount: true,
            volumePromoName: true,
            volumePromoQty: true,
            volumePromoDiscount: true,
            nthPromoName: true,
            nthPromoQty: true,
            nthPromoPercent: true,
            nthPromoDiscount: true,
            discountType: true,
            discountValue: true,
            discountAmount: true,
            totalLine: true,
            // Unidades avanzadas
            unitSunatCode: true,
            unitSymbol: true,
            unitCodeUsed: true,
            quantityOriginal: true,
            quantityBase: true,
            conversionFactorUsed: true,
            pricingMode: true,
            sellUnitPriceApplied: true,
            // ✅ PH8: Snapshot farmacéutico
            commercialName: true,
            genericName: true,
            concentration: true,
            pharmaceuticalForm: true,
            unitSunatCodeUsed: true,
          },
        },
        // Usuario - solo nombre
        user: {
          select: {
            name: true,
          },
        },
        // Cliente - solo nombre y teléfono
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        // Turno - solo fecha de apertura
        shift: {
          select: {
            openedAt: true,
          },
        },
        // Tienda - datos para el ticket
        store: {
          select: {
            name: true,
            ruc: true,
            address: true,
            phone: true,
            settings: {
              select: {
                ticketFooter: true,
                ticketLogo: true,
              },
            },
          },
        },
        // Comprobante electrónico - solo el más reciente
        electronicDocuments: {
          select: {
            id: true,
            docType: true,
            series: true,
            number: true,
            status: true,
            sunatCode: true,
            sunatMessage: true,
            customerDocType: true,
            customerDocNumber: true,
            customerName: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { code: 'SALE_NOT_FOUND', message: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    // Check permissions: OWNER sees all, CASHIER sees only their sales
    if (session.role === 'CASHIER' && sale.userId !== session.userId) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permiso para ver esta venta' },
        { status: 403 }
      );
    }

    // Representación impresa: la boleta o factura vigente de la venta. Las
    // notas no reemplazan el comprobante original en el ticket.
    const fiscalDocument = await prisma.electronicDocument.findFirst({
      where: { saleId: sale.id, storeId: session.storeId, docType: { in: ['FACTURA', 'BOLETA'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        docType: true, series: true, number: true, fullNumber: true, issueDate: true,
        customerDocType: true, customerDocNumber: true, customerName: true, customerAddress: true,
        taxable: true, igv: true, total: true, status: true, hash: true, qrText: true,
        sunatSettings: { select: { env: true, ruc: true, razonSocial: true, address: true } },
        store: { select: { name: true, ruc: true, address: true } },
      },
    });
    const fiscalTicket = fiscalDocument
      ? buildFiscalTicket({
          document: fiscalDocument,
          settings: fiscalDocument.sunatSettings,
          store: fiscalDocument.store,
        })
      : null;

    return NextResponse.json({ sale: { ...sale, fiscalTicket } });
  } catch (error) {
    console.error('Error fetching sale:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener venta' },
      { status: 500 }
    );
  }
}
