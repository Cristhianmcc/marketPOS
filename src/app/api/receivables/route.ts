// app/api/receivables/route.ts
// Listar cuentas por cobrar

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // OPEN, PAID, CANCELLED
    const customerId = searchParams.get('customerId');

    const where: any = {
      storeId: session.storeId,
    };

    if (status && ['OPEN', 'PAID', 'CANCELLED'].includes(status)) {
      where.status = status;
    }

    if (customerId) {
      where.customerId = customerId;
    }

    const receivables = await prisma.receivable.findMany({
      where,
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        sale: {
          select: {
            saleNumber: true,
            total: true,
            createdAt: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            method: true,
            notes: true,
            createdAt: true,
            createdBy: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      receivables: receivables.map((r) => ({
        id: r.id,
        customer: {
          id: r.customerId,
          name: r.customer.name,
          phone: r.customer.phone,
        },
        sale: {
          saleNumber: r.sale.saleNumber,
          total: Number(r.sale.total),
          createdAt: r.sale.createdAt,
        },
        originalAmount: Number(r.originalAmount),
        balance: Number(r.balance),
        status: r.status,
        createdAt: r.createdAt,
        payments: r.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          method: p.method,
          notes: p.notes,
          createdAt: p.createdAt,
          createdBy: p.createdBy.name,
        })),
      })),
    });
  } catch (error) {
    console.error('Error fetching receivables:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener cuentas por cobrar' },
      { status: 500 }
    );
  }
}
