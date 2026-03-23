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
    const productId = searchParams.get('productId') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    // ✅ MÓDULO 17.2: Si hay productId, buscar directamente
    if (productId) {
      const product = await storeProductRepo.findByStoreAndProduct(user.storeId, productId);
      if (!product) {
        return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
      }
      return NextResponse.json([product]); // Devolver array para mantener consistencia
    }

    const filters = {
      query,
      category,
      lowStock,
      active: active !== null ? active === 'true' : undefined,
      limit: query ? undefined : limit,
      offset: query ? undefined : (page - 1) * limit,
    };

    const products = await storeProductRepo.findByStoreId(user.storeId, filters);

    // Contar total con query eficiente (sin traer datos)
    const countFilters = { query, category, lowStock, active: active !== null ? active === 'true' : undefined };
    const total = query ? products.length : await storeProductRepo.countByStoreId(user.storeId, countFilters);

    return NextResponse.json({
      products,
      count: products.length,
      total,
      page,
      limit,
      totalPages: query ? 1 : Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json(
      { error: 'Error al obtener inventario' },
      { status: 500 }
    );
  }
}