import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStoreUser } from '@/lib/session';
import { PrismaMovementRepository } from '@/infra/db/repositories/PrismaMovementRepository';

const movementRepo = new PrismaMovementRepository();

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentStoreUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const storeProductId = searchParams.get('storeProductId');
    const limit = parseInt(searchParams.get('limit') || '50');

    let movements;
    if (storeProductId) {
      movements = await movementRepo.findByStoreProductId(storeProductId, limit);
    } else {
      movements = await movementRepo.findByStoreId(user.storeId, limit);
    }

    return NextResponse.json({ movements, count: movements.length });
  } catch (error) {
    console.error('Error fetching movements:', error);
    return NextResponse.json(
      { error: 'Error al obtener movimientos' },
      { status: 500 }
    );
  }
}
