// POST /api/shifts/open
// Open a new shift with opening cash

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData, sessionOptions } from '@/lib/session';
import { cookies } from 'next/headers';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';

const shiftRepo = new PrismaShiftRepository();

interface OpenShiftRequest {
  openingCash: number;
}

export async function POST(request: Request) {
  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const body: OpenShiftRequest = await request.json();

    // Validar openingCash
    if (typeof body.openingCash !== 'number' || body.openingCash < 0) {
      return NextResponse.json(
        {
          code: 'INVALID_OPENING_CASH',
          message: 'La caja inicial debe ser un número mayor o igual a 0',
        },
        { status: 400 }
      );
    }

    // Verificar que no haya turno abierto
    const hasOpenShift = await shiftRepo.hasOpenShift(session.storeId, session.userId);

    if (hasOpenShift) {
      return NextResponse.json(
        {
          code: 'SHIFT_ALREADY_OPEN',
          message: 'Ya tienes un turno abierto. Ciérralo antes de abrir uno nuevo.',
        },
        { status: 409 }
      );
    }

    // Crear turno
    const shift = await shiftRepo.create(session.storeId, session.userId, {
      openingCash: body.openingCash,
    });

    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    console.error('Error opening shift:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al abrir turno' },
      { status: 500 }
    );
  }
}
