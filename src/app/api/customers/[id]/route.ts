// app/api/customers/[id]/route.ts
// Actualizar y obtener cliente individual

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';

// GET /api/customers/:id - Obtener cliente con detalles
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        storeId: session.storeId,
      },
      include: {
        receivables: {
          where: { status: 'OPEN' },
          include: {
            sale: {
              select: {
                saleNumber: true,
                total: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { code: 'CUSTOMER_NOT_FOUND', message: 'Cliente no encontrado' },
        { status: 404 }
      );
    }

    // Calcular saldo total
    const totalBalance = customer.receivables.reduce(
      (sum, r) => sum + Number(r.balance),
      0
    );

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        dni: customer.dni,
        notes: customer.notes,
        active: customer.active,
        createdAt: customer.createdAt,
        totalBalance,
        openReceivables: customer.receivables.map((r) => ({
          id: r.id,
          saleNumber: r.sale.saleNumber,
          originalAmount: Number(r.originalAmount),
          balance: Number(r.balance),
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener cliente' },
      { status: 500 }
    );
  }
}

// PATCH /api/customers/:id - Actualizar cliente
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, phone, dni, notes, active } = body;

    // Verificar que el cliente pertenece a la tienda
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        storeId: session.storeId,
      },
    });

    if (!existingCustomer) {
      return NextResponse.json(
        { code: 'CUSTOMER_NOT_FOUND', message: 'Cliente no encontrado' },
        { status: 404 }
      );
    }

    // Validaciones
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return NextResponse.json(
          { code: 'NAME_REQUIRED', message: 'El nombre es obligatorio' },
          { status: 400 }
        );
      }
      if (name.length > 100) {
        return NextResponse.json(
          { code: 'NAME_TOO_LONG', message: 'El nombre es demasiado largo' },
          { status: 400 }
        );
      }
    }

    // Actualizar
    const data: any = {};
    if (name !== undefined) data.name = name.trim();
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (dni !== undefined) data.dni = dni?.trim() || null;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (active !== undefined) data.active = active;

    const customer = await prisma.customer.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        dni: customer.dni,
        notes: customer.notes,
        active: customer.active,
      },
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al actualizar cliente' },
      { status: 500 }
    );
  }
}
