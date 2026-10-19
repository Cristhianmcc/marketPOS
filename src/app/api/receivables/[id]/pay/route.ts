// app/api/receivables/[id]/pay/route.ts
// Pagar (abonar) cuenta por cobrar

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';
import { logAudit, getRequestMetadata } from '@/lib/auditLog'; // ✅ MÓDULO 15: Auditoría
import { checkRateLimit } from '@/lib/rateLimit'; // ✅ MÓDULO 16.1: Rate Limiting
import { createHash } from 'crypto';

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

    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128
      || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
      return NextResponse.json(
        { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Identificador de pago inválido' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { amount, method, notes } = body;

    // Dinero con máximo dos decimales. Evita importes no finitos y residuos
    // binarios antes de convertirlos a Decimal.
    const amountInCents = typeof amount === 'number' && Number.isFinite(amount)
      ? Math.round(amount * 100)
      : 0;
    if (amountInCents <= 0 || Math.abs(amount * 100 - amountInCents) > 1e-8) {
      return NextResponse.json(
        { code: 'INVALID_AMOUNT', message: 'El monto debe ser mayor a 0 y tener máximo 2 decimales' },
        { status: 400 }
      );
    }
    const normalizedAmount = amountInCents / 100;

    if (!method || !['CASH', 'YAPE', 'PLIN', 'CARD'].includes(method)) {
      return NextResponse.json(
        { code: 'INVALID_PAYMENT_METHOD', message: 'Método de pago inválido' },
        { status: 400 }
      );
    }

    // El ID determinista hace persistente la idempotencia sin agregar una
    // columna ni requerir una migración de la base instalada.
    const paymentId = `rp_${createHash('sha256')
      .update(`${session.storeId}:${receivableId}:${idempotencyKey}`)
      .digest('hex')}`;

    const existingPayment = await prisma.receivablePayment.findUnique({
      where: { id: paymentId },
      include: {
        receivable: {
          include: {
            customer: true,
            sale: { select: { saleNumber: true, total: true } },
          },
        },
      },
    });
    if (existingPayment) {
      if (existingPayment.storeId !== session.storeId
        || existingPayment.receivableId !== receivableId
        || Number(existingPayment.amount) !== normalizedAmount
        || existingPayment.method !== method) {
        return NextResponse.json(
          { code: 'IDEMPOTENCY_KEY_REUSED', message: 'El identificador ya fue usado para otro pago' },
          { status: 409 }
        );
      }
      return NextResponse.json({
        success: true,
        replayed: true,
        payment: {
          id: existingPayment.id,
          amount: Number(existingPayment.amount),
          method: existingPayment.method,
          createdAt: existingPayment.createdAt,
        },
        receivable: {
          id: existingPayment.receivable.id,
          balance: Number(existingPayment.receivable.balance),
          status: existingPayment.receivable.status,
          customer: existingPayment.receivable.customer.name,
          saleNumber: existingPayment.receivable.sale.saleNumber,
        },
      });
    }

    // ✅ MÓDULO 16.1: Rate Limiting
    const rateLimitResult = checkRateLimit('receivable-pay', session.userId);
    if (!rateLimitResult.allowed) {
      // Auditoría de rate limit
      const { ip, userAgent } = getRequestMetadata(request);
      logAudit({
        storeId: session.storeId,
        userId: session.userId,
        action: 'RATE_LIMIT_EXCEEDED',
        entityType: 'RECEIVABLE',
        severity: 'WARN',
        meta: {
          endpoint: 'receivable-pay',
          resetAt: new Date(rateLimitResult.resetAt).toISOString(),
        },
        ip,
        userAgent,
      }).catch(() => {});

      return NextResponse.json(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.',
        },
        { status: 429 }
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
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
      const paymentAmount = new Prisma.Decimal(normalizedAmount);

      // La condición y el decremento ocurren en una sola sentencia. Dos cobros
      // concurrentes ya no pueden leer el mismo saldo y sobrescribirse.
      const claimed = await tx.receivable.updateMany({
        where: {
          id: receivableId,
          storeId: session.storeId,
          status: 'OPEN',
          balance: { gte: paymentAmount },
        },
        data: { balance: { decrement: paymentAmount } },
      });

      if (claimed.count !== 1) {
        const current = await tx.receivable.findFirst({
          where: { id: receivableId, storeId: session.storeId },
          select: { status: true, balance: true },
        });
        if (!current) throw new Error('RECEIVABLE_NOT_FOUND');
        if (current.status === 'CANCELLED') throw new Error('RECEIVABLE_CANCELLED');
        if (current.status === 'PAID') throw new Error('RECEIVABLE_ALREADY_PAID');
        throw new Error('OVERPAYMENT');
      }

      const payment = await tx.receivablePayment.create({
        data: {
          id: paymentId,
          storeId: session.storeId,
          receivableId,
          shiftId: currentShift.id,
          amount: paymentAmount,
          method,
          notes: notes?.trim() || null,
          createdById: session.userId,
        },
      });

      let updatedReceivable = await tx.receivable.findFirst({
        where: { id: receivableId, storeId: session.storeId },
        include: {
          customer: true,
          sale: { select: { saleNumber: true, total: true } },
        },
      });
      if (!updatedReceivable) throw new Error('RECEIVABLE_NOT_FOUND');

      if (Number(updatedReceivable.balance) === 0) {
        updatedReceivable = await tx.receivable.update({
          where: { id: updatedReceivable.id },
          data: { status: 'PAID' },
          include: {
            customer: true,
            sale: { select: { saleNumber: true, total: true } },
          },
        });
      }

        return { payment, updatedReceivable, receivable: updatedReceivable };
      });
    } catch (transactionError: any) {
      // Dos solicitudes idénticas pueden llegar antes de que cualquiera vea el
      // pago existente. La PK determinista deja ganar una sola transacción; la
      // otra se revierte completa y responde con el resultado ya confirmado.
      if (transactionError?.code !== 'P2002') throw transactionError;

      const replayedPayment = await prisma.receivablePayment.findUnique({
        where: { id: paymentId },
        include: {
          receivable: {
            include: {
              customer: true,
              sale: { select: { saleNumber: true, total: true } },
            },
          },
        },
      });
      if (!replayedPayment
        || replayedPayment.storeId !== session.storeId
        || replayedPayment.receivableId !== receivableId
        || Number(replayedPayment.amount) !== normalizedAmount
        || replayedPayment.method !== method) {
        throw transactionError;
      }

      return NextResponse.json({
        success: true,
        replayed: true,
        payment: {
          id: replayedPayment.id,
          amount: Number(replayedPayment.amount),
          method: replayedPayment.method,
          createdAt: replayedPayment.createdAt,
        },
        receivable: {
          id: replayedPayment.receivable.id,
          balance: Number(replayedPayment.receivable.balance),
          status: replayedPayment.receivable.status,
          customer: replayedPayment.receivable.customer.name,
          saleNumber: replayedPayment.receivable.sale.saleNumber,
        },
      });
    }

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
        paymentAmount: normalizedAmount,
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
