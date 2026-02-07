import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { CreateProductSchema } from '@/domain/schemas/inventory';
import { PrismaProductRepository } from '@/infra/db/repositories/PrismaProductRepository';
import { nanoid } from 'nanoid';

const productRepo = new PrismaProductRepository();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';

    // Si query está vacío, buscar todos (con límite)
    const products = await productRepo.search(query, 20);

    return NextResponse.json({
      products,
      count: products.length,
    });
  } catch (error) {
    console.error('Error searching products:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
        { error: 'Solo el propietario puede crear productos' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validation = CreateProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Generate internal SKU
    const internalSku = `SKU-${nanoid(10).toUpperCase()}`;

    // Check if barcode exists
    if (data.barcode) {
      const existing = await productRepo.findByBarcode(data.barcode);
      if (existing) {
        return NextResponse.json(
          { error: 'Ya existe un producto con ese código de barras' },
          { status: 400 }
        );
      }
    }

    const product = await productRepo.create({
      barcode: data.barcode || null,
      internalSku,
      name: data.name,
      brand: data.brand || null,
      content: data.content || null,
      category: data.category,
      unitType: data.unitType,
      baseUnitId: data.baseUnitId || null, // ✅ MÓDULO F2.1: Unidad SUNAT
      imageUrl: data.imageUrl || null,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: 'Error al crear producto' },
      { status: 500 }
    );
  }
}
