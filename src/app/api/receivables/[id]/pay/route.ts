// app/api/receivables/[id]/pay/route.ts
// Pagar (abonar) cuenta por cobrar

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';
import { logAudit, getRequestMetadata } from '@/lib/auditLog'; // ✅ MÓDULO 15: Auditoría

const shiftRepo = new PrismaShiftRepository();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: receivableId } = await params;
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { amount, method, notes } = body;

    // Validaciones
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { code: 'INVALID_AMOUNT', message: 'El monto debe ser mayor a 0' },
        { status: 400 }
      );
    }

    if (!method || !['CASH', 'YAPE', 'PLIN', 'CARD'].includes(method)) {
      return NextResponse.json(
        { code: 'INVALID_PAYMENT_METHOD', message: 'Método de pago inválido' },
        { status: 400 }
      );
    }

    // Validar que hay turno abierto
    const currentShift = await shiftRepo.getCurrentShift(
      session.storeId,
      session.userId
    );

    if (!currentShift) {
      return NextResponse.json(
        { code: 'SHIFT_REQUIRED', message: 'Debes abrir un turno antes de cobrar' },
        { status: 409 }
      );
    }

    // Ejecutar pago en transacción ACID
    const result = await prisma.$transaction(async (tx) => {
      // 1. Obtener receivable con lock
      const receivable = await tx.receivable.findFirst({
        where: {
          id: receivableId,
          storeId: session.storeId,
        },
        include: {
          customer: true,
          sale: {
            select: {
              saleNumber: true,
              total: true,
            },
          },
        },
      });

      if (!receivable) {
        throw new Error('RECEIVABLE_NOT_FOUND');
      }

      if (receivable.status === 'CANCELLED') {
        throw new Error('RECEIVABLE_CANCELLED');
      }

      if (receivable.status === 'PAID') {
        throw new Error('RECEIVABLE_ALREADY_PAID');
      }

      const currentBalance = Number(receivable.balance);

      // 2. Validar que el monto no exceda el saldo
      if (amount > currentBalance) {
        throw new Error('OVERPAYMENT');
      }

      // 3. Crear pago
      const payment = await tx.receivablePayment.create({
        data: {
          storeId: session.storeId,
          receivableId: receivable.id,
          shiftId: currentShift.id,
          amount: new Prisma.Decimal(amount),
          method,
          notes: notes?.trim() || null,
          createdById: session.userId,
        },
      });

      // 4. Reducir balance
      const newBalance = currentBalance - amount;
      const newStatus = newBalance === 0 ? 'PAID' : 'OPEN';

      const updatedReceivable = await tx.receivable.update({
        where: { id: receivable.id },
        data: {
          balance: new Prisma.Decimal(newBalance),
          status: newStatus,
        },
      });

      return { payment, updatedReceivable, receivable };
    });

    // ✅ MÓDULO 15: Log de auditoría (fire-and-forget)
    const { ip, userAgent } = getRequestMetadata(request);
    logAudit({
      storeId: session.storeId,
      userId: session.userId,
      action: 'RECEIVABLE_PAID',
      entityType: 'RECEIVABLE',
      entityId: result.updatedReceivable.id,
      severity: result.updatedReceivable.status === 'PAID' ? 'INFO' : 'WARN',
      meta: {
        customerId: result.receivable.customerId,
        customerName: result.receivable.customer.name,
        saleNumber: result.receivable.sale.saleNumber,
        paymentAmount: amount,
        paymentMethod: method,
        remainingBalance: Number(result.updatedReceivable.balance),
        isPaidInFull: result.updatedReceivable.status === 'PAID',
      },
      ip,
      userAgent,
    }).catch(e => console.error('Audit log failed (non-blocking):', e));

    return NextResponse.json({
      success: true,
      payment: {
        id: result.payment.id,
        amount: Number(result.payment.amount),
        method: result.payment.method,
        createdAt: result.payment.createdAt,
      },
      receivable: {
        id: result.updatedReceivable.id,
        balance: Number(result.updatedReceivable.balance),
        status: result.updatedReceivable.status,
        customer: result.receivable.customer.name,
        saleNumber: result.receivable.sale.saleNumber,
      },
    });
  } catch (error: any) {
    console.error('Error processing payment:', error);

    // ✅ MÓDULO 15: Log de fallo (fire-and-forget)
    try {
      const { id: receivableId } = await params;
      const { ip, userAgent } = getRequestMetadata(request);
      const sessionData = await getSession();
      
      logAudit({
        storeId: sessionData?.storeId,
        userId: sessionData?.userId,
        action: 'RECEIVABLE_PAYMENT_FAILED',
        entityType: 'RECEIVABLE',
        entityId: receivableId,
        severity: 'ERROR',
        meta: {
          error: error.message || 'Unknown error',
          errorCode: ['RECEIVABLE_NOT_FOUND', 'RECEIVABLE_CANCELLED', 'RECEIVABLE_ALREADY_PAID', 'OVERPAYMENT'].includes(error.message) ? error.message : 'INTERNAL_ERROR',
        },
        ip,
        userAgent,
      }).catch(e => console.error('Audit log failed (non-blocking):', e));
    } catch {}

    // Errores específicos
    if (error.message === 'RECEIVABLE_NOT_FOUND') {
      return NextResponse.json(
        { code: 'RECEIVABLE_NOT_FOUND', message: 'Cuenta por cobrar no encontrada' },
        { status: 404 }
      );
    }

    if (error.message === 'RECEIVABLE_CANCELLED') {
      return NextResponse.json(
        { code: 'RECEIVABLE_CANCELLED', message: 'Esta cuenta fue cancelada' },
        { status: 409 }
      );
    }

    if (error.message === 'RECEIVABLE_ALREADY_PAID') {
      return NextResponse.json(
        { code: 'RECEIVABLE_ALREADY_PAID', message: 'Esta cuenta ya está pagada' },
        { status: 409 }
      );
    }

    if (error.message === 'OVERPAYMENT') {
      return NextResponse.json(
        {
          code: 'OVERPAYMENT',
          message: 'El monto excede el saldo pendiente',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al procesar pago' },
      { status: 500 }
    );
  }
}
