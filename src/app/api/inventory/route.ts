import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { PrismaStoreProductRepository } from '@/infra/db/repositories/PrismaStoreProductRepository';

const storeProductRepo = new PrismaStoreProductRepository();

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('query') || undefined;
    const category = searchParams.get('category') || undefined;
    const lowStock = searchParams.get('lowStock') === 'true';
    const active = searchParams.get('active');

    const filters = {
      query,
      category,
      lowStock,
      active: active !== null ? active === 'true' : undefined,
    };

    const products = await storeProductRepo.findByStoreId(user.storeId, filters);

    return NextResponse.json({ products, count: products.length });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json(
      { error: 'Error al obtener inventario' },
      { status: 500 }
    );
  }
}