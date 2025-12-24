// POST /api/shifts/[id]/close
// Close a shift with closing cash and notes

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData, sessionOptions } from '@/lib/session';
import { cookies } from 'next/headers';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';

const shiftRepo = new PrismaShiftRepository();

interface CloseShiftRequest {
  closingCash: number;
  notes?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { id: shiftId } = await params;
    const body: CloseShiftRequest = await request.json();

    // Validar closingCash
    if (typeof body.closingCash !== 'number' || body.closingCash < 0) {
      return NextResponse.json(
        {
          code: 'INVALID_CLOSING_CASH',
          message: 'La caja final debe ser un número mayor o igual a 0',
        },
        { status: 400 }
      );
    }

    // Obtener shift
    const shift = await shiftRepo.findById(shiftId, session.storeId);

    if (!shift) {
      return NextResponse.json(
        { code: 'SHIFT_NOT_FOUND', message: 'Turno no encontrado' },
        { status: 404 }
      );
    }

    // Verificar que esté abierto
    if (shift.closedAt) {
      return NextResponse.json(
        { code: 'SHIFT_ALREADY_CLOSED', message: 'El turno ya está cerrado' },
        { status: 409 }
      );
    }

    // Solo puede cerrar el mismo usuario o un OWNER
    if (shift.openedById !== session.userId && session.role !== 'OWNER') {
      return NextResponse.json(
        {
          code: 'SHIFT_FORBIDDEN',
          message: 'No tienes permiso para cerrar este turno',
        },
        { status: 403 }
      );
    }

    // Calcular expectedCash
    const cashSales = await shiftRepo.getCashSalesTotal(shiftId);
    const expectedCash = shift.openingCash + cashSales;
    const difference = body.closingCash - expectedCash;

    // Cerrar turno
    const closedShift = await shiftRepo.close(
      shiftId,
      session.userId,
      { closingCash: body.closingCash, notes: body.notes },
      expectedCash,
      difference
    );

    return NextResponse.json({ shift: closedShift });
  } catch (error) {
    console.error('Error closing shift:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al cerrar turno' },
      { status: 500 }
    );
  }
}
