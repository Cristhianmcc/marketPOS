import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId || !session.storeId) {
      return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const q = new URL(request.url).searchParams.get('q');
    if (!q || q.trim().length < 2) {
      return NextResponse.json([]);
    }

    const products = await prisma.storeProduct.findMany({
      where: {
        storeId: session.storeId,
        active: true,
        product: {
          name: { contains: q, mode: 'insensitive' },
        },
      },
      select: {
        product: {
          select: { name: true },
        },
      },
      take: 10,
    });

    return NextResponse.json(
      products.map(p => ({ name: p.product.name }))
    );
  } catch (error) {
    console.error('Error searching products:', error);
    return NextResponse.json({ code: 'SERVER_ERROR' }, { status: 500 });
  }
}
