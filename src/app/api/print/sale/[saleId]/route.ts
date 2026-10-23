/**
 * GET /api/print/sale/[saleId]
 * Devuelve el snapshot de una venta de la tienda autenticada para imprimirlo
 * desde Electron. Los importes Decimal se serializan como numeros.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentStoreUser } from '@/lib/session';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const session = await getCurrentStoreUser();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { saleId } = await params;
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, storeId: session.storeId },
      include: {
        items: true,
        store: true,
        user: { select: { name: true } },
        customer: { select: { name: true } },
        receivable: { select: { balance: true } },
      },
    });

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    const saleDate = new Date(sale.createdAt);
    const items = sale.items.map((item) => ({
      name: item.productContent
        ? `${item.productName} ${item.productContent}`
        : item.productName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.totalLine || item.subtotal),
      discount: Number(item.discountAmount),
      unit: item.unitSymbol || item.unitType,
    }));

    const discounts: Array<{
      type: 'item' | 'order' | 'coupon' | 'promo';
      description: string;
      amount: number;
    }> = [];

    const itemDiscounts = sale.items.reduce(
      (sum, item) => sum + Number(item.discountAmount),
      0,
    );
    if (itemDiscounts > 0) {
      discounts.push({
        type: 'item',
        description: 'Desc. por producto',
        amount: itemDiscounts,
      });
    }

    const couponDiscount = Number(sale.couponDiscount);
    if (couponDiscount > 0) {
      discounts.push({
        type: 'coupon',
        description: sale.couponCode || 'Cupon',
        amount: couponDiscount,
      });
    }

    const discountTotal = Number(sale.discountTotal);
    const remainingDiscount = Math.max(0, discountTotal - itemDiscounts - couponDiscount);
    if (remainingDiscount > 0) {
      discounts.push({
        type: 'order',
        description: 'Descuento general',
        amount: remainingDiscount,
      });
    }

    const payment: {
      method: string;
      amountPaid?: number;
      change?: number;
      customerName?: string;
      customerBalance?: number;
    } = { method: sale.paymentMethod };

    if (sale.paymentMethod === 'CASH') {
      payment.amountPaid = Number(sale.amountPaid ?? sale.total);
      payment.change = Number(sale.changeAmount ?? 0);
    }
    if (sale.paymentMethod === 'FIADO' && sale.customer) {
      payment.customerName = sale.customer.name;
      payment.customerBalance = Number(sale.receivable?.balance ?? 0);
    }

    const settings = await prisma.storeSettings.findUnique({
      where: { storeId: sale.storeId },
      select: { ticketFooter: true },
    });

    return NextResponse.json({
      store: {
        name: sale.store.name,
        ruc: sale.store.ruc || undefined,
        address: sale.store.address || undefined,
        phone: sale.store.phone || undefined,
      },
      saleNumber: String(sale.saleNumber),
      date: saleDate.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      time: saleDate.toLocaleTimeString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      items,
      subtotal: Number(sale.totalBeforeDiscount || sale.subtotal),
      totalDiscount: discountTotal,
      total: Number(sale.total),
      discounts: discounts.length > 0 ? discounts : undefined,
      payment,
      cashierName: sale.user.name,
      footer: settings?.ticketFooter || undefined,
    });
  } catch (error) {
    console.error('[Print API] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
