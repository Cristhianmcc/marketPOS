// GET /api/shifts/current
// Get current open shift for the authenticated user

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData, sessionOptions } from '@/lib/session';
import { cookies } from 'next/headers';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';

const shiftRepo = new PrismaShiftRepository();

export async function GET() {
  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const shift = await shiftRepo.getCurrentShift(session.storeId, session.userId);

    return NextResponse.json({ shift });
  } catch (error) {
    console.error('Error getting current shift:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener turno actual' },
      { status: 500 }
    );
  }
}
