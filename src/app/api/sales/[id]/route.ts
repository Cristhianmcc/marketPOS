import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session.userId) {
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
            quantityOriginal: true,
            baseUnitQty: true,
            conversionFactor: true,
            pricingMode: true,
            sellUnitPriceApplied: true,
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

    return NextResponse.json({ sale });
  } catch (error) {
    console.error('Error fetching sale:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener venta' },
      { status: 500 }
    );
  }
}
