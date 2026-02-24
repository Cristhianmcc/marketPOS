/**
 * API Route: GET /api/print/sale/[saleId]
 * Returns sale data formatted for ESC/POS ticket printing
 * Used by Electron desktop app for thermal printing
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  try {
    // Validate session
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { saleId } = await params;

    // Fetch sale with all related data
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        store: true,
        user: {
          select: { name: true },
        },
        customer: {
          select: { 
            name: true,
            balance: true,
          },
        },
        couponUsages: {
          include: {
            coupon: true,
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    // Verify store access
    if (session.storeId && sale.storeId !== session.storeId) {
      return NextResponse.json(
        { error: 'No autorizado para esta tienda' },
        { status: 403 }
      );
    }

    // Format store info
    const store = {
      name: sale.store.name,
      ruc: sale.store.ruc || undefined,
      address: sale.store.address || undefined,
      phone: sale.store.phone || undefined,
    };

    // Format date and time
    const saleDate = new Date(sale.createdAt);
    const date = saleDate.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const time = saleDate.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Format items
    const items = sale.items.map(item => ({
      name: item.product?.name || item.description || 'Producto',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      discount: item.discount || 0,
      unit: item.unit || undefined,
    }));

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.subtotal + (item.discount || 0), 0);
    
    // Collect discounts
    const discounts: Array<{
      type: 'item' | 'order' | 'coupon' | 'promo';
      description: string;
      amount: number;
    }> = [];

    // Item discounts
    const itemDiscounts = items.reduce((sum, item) => sum + (item.discount || 0), 0);
    if (itemDiscounts > 0) {
      discounts.push({
        type: 'item',
        description: 'Desc. por producto',
        amount: itemDiscounts,
      });
    }

    // Order discount
    if (sale.discount && sale.discount > 0) {
      discounts.push({
        type: 'order',
        description: 'Descuento general',
        amount: sale.discount,
      });
    }

    // Coupon discount
    if (sale.couponUsages && sale.couponUsages.length > 0) {
      for (const usage of sale.couponUsages) {
        discounts.push({
          type: 'coupon',
          description: usage.coupon.code,
          amount: usage.discountAmount,
        });
      }
    }

    const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);

    // Format payment
    const payment: {
      method: string;
      amountPaid?: number;
      change?: number;
      customerName?: string;
      customerBalance?: number;
    } = {
      method: sale.paymentMethod,
    };

    if (sale.paymentMethod === 'CASH') {
      payment.amountPaid = sale.amountPaid || sale.total;
      payment.change = sale.change || 0;
    }

    if (sale.paymentMethod === 'FIADO' && sale.customer) {
      payment.customerName = sale.customer.name;
      payment.customerBalance = sale.customer.balance || 0;
    }

    // Get store footer from settings
    let footer: string | undefined;
    try {
      const settings = await prisma.storeSettings.findFirst({
        where: { storeId: sale.storeId },
        select: { receiptFooter: true },
      });
      footer = settings?.receiptFooter || undefined;
    } catch {
      // Settings might not exist
    }

    // Build response
    const printData = {
      store,
      saleNumber: sale.saleNumber || sale.id.substring(0, 8).toUpperCase(),
      date,
      time,
      items,
      subtotal,
      totalDiscount,
      total: sale.total,
      discounts: discounts.length > 0 ? discounts : undefined,
      payment,
      cashierName: sale.user?.name || undefined,
      footer,
    };

    return NextResponse.json(printData);
  } catch (error) {
    console.error('[Print API] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
