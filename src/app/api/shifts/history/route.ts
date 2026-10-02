// GET /api/shifts/history
// Get shift history (filtered by role)

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData, sessionOptions } from '@/lib/session';
import { cookies } from 'next/headers';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';

const shiftRepo = new PrismaShiftRepository();

export async function GET(request: Request) {
  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);
    const search = searchParams.get('search') || undefined;

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    // OWNER ve todos los turnos, CASHIER solo los suyos
    const userId = session.role === 'OWNER' ? null : session.userId;

    const { shifts, total } = await shiftRepo.getHistory(
      session.storeId,
      userId,
      fromDate,
      toDate,
      page,
      limit,
      search
    );

    return NextResponse.json({ shifts, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error getting shift history:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener historial de turnos' },
      { status: 500 }
    );
  }
}
