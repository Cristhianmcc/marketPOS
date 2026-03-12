// GET /api/shifts/[id]/cash-total
// Returns total cash for a shift including CASH sales + CASH receivable payments

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData, sessionOptions } from '@/lib/session';
import { cookies } from 'next/headers';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';

const shiftRepo = new PrismaShiftRepository();

export async function GET(
  _request: Request,
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

    if (!shiftId) {
      return NextResponse.json(
        { code: 'SHIFT_NOT_FOUND', message: 'ID de turno requerido' },
        { status: 400 }
      );
    }

    const shift = await shiftRepo.findById(shiftId, session.storeId!);
    if (!shift) {
      return NextResponse.json(
        { code: 'SHIFT_NOT_FOUND', message: 'Turno no encontrado' },
        { status: 404 }
      );
    }

    const cashTotal = await shiftRepo.getCashSalesTotal(shiftId);

    return NextResponse.json({ cashTotal });
  } catch (error) {
    console.error('Error getting shift cash total:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener total en efectivo' },
      { status: 500 }
    );
  }
}
