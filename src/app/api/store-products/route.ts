import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { ConfigureStoreProductSchema } from '@/domain/schemas/inventory';
import { PrismaStoreProductRepository } from '@/infra/db/repositories/PrismaStoreProductRepository';

const storeProductRepo = new PrismaStoreProductRepository();

// ✅ MÓDULO 18.2: Check if product exists in store
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'productId requerido' }, { status: 400 });
    }

    const existing = await storeProductRepo.findByStoreAndProduct(
      user.storeId,
      productId
    );

    return NextResponse.json({ exists: !!existing });
  } catch (error) {
    console.error('Error checking store product:', error);
    return NextResponse.json(
      { error: 'Error al verificar producto' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede configurar productos' },
        { status: 403 }
      );
    }

    const body = await req.json();
    
    const validation = ConfigureStoreProductSchema.safeParse(body);

    if (!validation.success) {
      console.error('Validation failed:', validation.error.format());
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Check if already exists
    const existing = await storeProductRepo.findByStoreAndProduct(
      user.storeId,
      data.productId
    );

    if (existing) {
      return NextResponse.json(
        { error: 'Este producto ya está configurado para tu tienda' },
        { status: 400 }
      );
    }

    const storeProduct = await storeProductRepo.create({
      storeId: user.storeId,
      productId: data.productId,
      price: data.price,
      stock: data.stock ?? null,
      minStock: data.minStock ?? null,
      active: data.active,
    });

    return NextResponse.json({ storeProduct }, { status: 201 });
  } catch (error) {
    console.error('Error configuring store product:', error);
    return NextResponse.json(
      { error: 'Error al configurar producto' },
      { status: 500 }
    );
  }
}
