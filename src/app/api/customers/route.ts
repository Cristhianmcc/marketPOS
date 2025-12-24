// app/api/customers/route.ts
// CRUD de clientes para FIADO

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';

// GET /api/customers - Listar clientes de la tienda
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
    const search = searchParams.get('search') || '';
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const where: any = {
      storeId: session.storeId,
    };

    if (activeOnly) {
      where.active = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { dni: { contains: search, mode: 'insensitive' } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            receivables: {
              where: { status: 'OPEN' },
            },
          },
        },
      },
    });

    // Calcular saldo pendiente de cada cliente
    const customersWithBalance = await Promise.all(
      customers.map(async (customer) => {
        const totalBalance = await prisma.receivable.aggregate({
          where: {
            customerId: customer.id,
            status: 'OPEN',
          },
          _sum: { balance: true },
        });

        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          dni: customer.dni,
          notes: customer.notes,
          active: customer.active,
          createdAt: customer.createdAt,
          openReceivablesCount: customer._count.receivables,
          totalBalance: totalBalance._sum.balance
            ? Number(totalBalance._sum.balance)
            : 0,
        };
      })
    );

    return NextResponse.json({ customers: customersWithBalance });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener clientes' },
      { status: 500 }
    );
  }
}

// POST /api/customers - Crear cliente
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.userId || !session.storeId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, phone, dni, notes } = body;

    // Validaciones
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

    // Crear cliente
    const customer = await prisma.customer.create({
      data: {
        storeId: session.storeId,
        name: name.trim(),
        phone: phone?.trim() || null,
        dni: dni?.trim() || null,
        notes: notes?.trim() || null,
        active: true,
      },
    });

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        dni: customer.dni,
        notes: customer.notes,
        active: customer.active,
        createdAt: customer.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al crear cliente' },
      { status: 500 }
    );
  }
}
