import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import bcrypt from 'bcrypt';
import { UnitType } from '@prisma/client';

export async function POST() {
  try {
    console.log('🔧 Starting database setup...');

    // Check if already set up
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json({
        success: true,
        message: 'Database already initialized',
        users: userCount,
      });
    }

    // Hash password for test users
    const hashedPassword = await bcrypt.hash('password123', 10);

    // 1. Create store
    const store = await prisma.store.create({
      data: {
        name: 'Bodega El Mercado',
        ruc: '20123456789',
        address: 'Av. Principal 123, Lima',
        phone: '987654321',
      },
    });
    console.log('✅ Store created');

    // 2. Create users
    const owner = await prisma.user.create({
      data: {
        storeId: store.id,
        email: 'owner@bodega.com',
        name: 'Juan Pérez',
        password: hashedPassword,
        role: 'OWNER',
      },
    });

    const cashier = await prisma.user.create({
      data: {
        storeId: store.id,
        email: 'cashier@bodega.com',
        name: 'María García',
        password: hashedPassword,
        role: 'CASHIER',
      },
    });
    console.log('✅ Users created');

    // 3. Create products
    const productsData = [
      {
        barcode: '7750243051234',
        internalSku: 'SKU-001',
        name: 'Inca Kola 500ml',
        brand: 'Coca-Cola',
        content: '500 ml',
        category: 'Bebidas',
        unitType: UnitType.UNIT,
      },
      {
        barcode: '7750109004567',
        internalSku: 'SKU-002',
        name: 'Inca Kola 1L',
        brand: 'Coca-Cola',
        content: '1 L',
        category: 'Bebidas',
        unitType: UnitType.UNIT,
      },
      {
        barcode: null,
        internalSku: 'INT-001',
        name: 'Pan Francés',
        brand: null,
        content: 'unidad',
        category: 'Panadería',
        unitType: UnitType.UNIT,
      },
    ];

    const products = await Promise.all(
      productsData.map((p) =>
        prisma.productMaster.create({
          data: p,
        })
      )
    );
    console.log('✅ Products created');

    // 4. Create store products
    const storeProducts = await Promise.all([
      prisma.storeProduct.create({
        data: {
          storeId: store.id,
          productId: products[0].id,
          price: 2.5,
          stock: 100,
          active: true,
        },
      }),
      prisma.storeProduct.create({
        data: {
          storeId: store.id,
          productId: products[1].id,
          price: 4.0,
          stock: 80,
          active: true,
        },
      }),
      prisma.storeProduct.create({
        data: {
          storeId: store.id,
          productId: products[2].id,
          price: 0.5,
          stock: 200,
          active: true,
        },
      }),
    ]);
    console.log('✅ Store products created');

    return NextResponse.json({
      success: true,
      message: 'Database setup completed successfully',
      data: {
        store: store.name,
        users: [owner.email, cashier.email],
        products: products.length,
        storeProducts: storeProducts.length,
      },
    });
  } catch (error: any) {
    console.error('Setup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
      },
      { status: 500 }
    );
  }
}
