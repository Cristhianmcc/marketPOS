// GET /api/system/store-status
// ✅ MÓDULO 16.2: Estado Operativo de la Tienda

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede ver el estado
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos para ver el estado del sistema' },
        { status: 403 }
      );
    }

    const storeId = session.storeId;

    // Obtener información de la tienda
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!store) {
      return NextResponse.json(
        { code: 'STORE_NOT_FOUND', message: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    // Buscar turno abierto actual (cualquier usuario de la tienda)
    const currentShift = await prisma.shift.findFirst({
      where: {
        storeId,
        closedAt: null,
      },
      orderBy: { openedAt: 'desc' },
      include: {
        openedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Estadísticas del día actual (desde las 00:00:00 hora local)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const todaySales = await prisma.sale.findMany({
      where: {
        storeId,
        createdAt: {
          gte: startOfDay,
        },
      },
      select: {
        id: true,
        total: true,
        paymentMethod: true,
      },
    });

    const salesCount = todaySales.length;
    const salesTotal = todaySales.reduce((sum, sale) => sum + sale.total.toNumber(), 0);
    const cashSales = todaySales
      .filter(s => s.paymentMethod === 'CASH')
      .reduce((sum, sale) => sum + sale.total.toNumber(), 0);

    const cashExpected = currentShift 
      ? currentShift.openingCash.toNumber() + cashSales
      : 0;

    return NextResponse.json({
      storeId: store.id,
      storeName: store.name,
      storeStatus: store.status,
      currentShift: currentShift ? {
        open: true,
        shiftId: currentShift.id,
        openedAt: currentShift.openedAt.toISOString(),
        openedBy: currentShift.openedBy.name,
        openingCash: currentShift.openingCash.toNumber(),
      } : {
        open: false,
      },
      today: {
        salesCount,
        salesTotal: Math.round(salesTotal * 100) / 100,
        cashExpected: Math.round(cashExpected * 100) / 100,
      },
    });
  } catch (error) {
    console.error('[Store Status] Error:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener estado de la tienda' },
      { status: 500 }
    );
  }
}
