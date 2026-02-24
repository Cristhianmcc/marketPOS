// src/app/api/setup/seed-products/route.ts
// Crea categorías y productos de ejemplo para una tienda nueva

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

// Helper para generar slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Helper para generar SKU
function generateSku(): string {
  return `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

// Categorías base para bodega/minimarket
const CATEGORIES_SEED = [
  { name: 'Abarrotes', icon: '🛒', color: '#F59E0B', order: 1 },
  { name: 'Bebidas', icon: '🥤', color: '#3B82F6', order: 2 },
  { name: 'Lácteos', icon: '🥛', color: '#10B981', order: 3 },
  { name: 'Limpieza', icon: '🧹', color: '#8B5CF6', order: 4 },
  { name: 'Snacks', icon: '🍿', color: '#EF4444', order: 5 },
  { name: 'Enlatados', icon: '🥫', color: '#F97316', order: 6 },
  { name: 'Licores', icon: '🍺', color: '#6366F1', order: 7 },
  { name: 'Panadería', icon: '🍞', color: '#D97706', order: 8 },
  { name: 'Golosinas', icon: '🍬', color: '#EC4899', order: 9 },
  { name: 'Higiene Personal', icon: '🧴', color: '#14B8A6', order: 10 },
];

// Productos de ejemplo por categoría
const PRODUCTS_SEED = [
  // Abarrotes
  { name: 'Arroz Costeño 1kg', category: 'Abarrotes', price: 4.50, stock: 50 },
  { name: 'Azúcar Rubia 1kg', category: 'Abarrotes', price: 3.80, stock: 40 },
  { name: 'Aceite Vegetal 1L', category: 'Abarrotes', price: 8.50, stock: 30 },
  { name: 'Fideos Spaghetti 500g', category: 'Abarrotes', price: 2.50, stock: 60 },
  { name: 'Sal de Mesa 1kg', category: 'Abarrotes', price: 1.50, stock: 35 },
  { name: 'Avena Quaker 400g', category: 'Abarrotes', price: 5.20, stock: 25 },
  { name: 'Lentejas 500g', category: 'Abarrotes', price: 4.00, stock: 30 },
  { name: 'Atún Florida 170g', category: 'Enlatados', price: 5.80, stock: 40 },
  
  // Bebidas
  { name: 'Agua San Luis 625ml', category: 'Bebidas', price: 1.50, stock: 100 },
  { name: 'Gaseosa Inca Kola 500ml', category: 'Bebidas', price: 2.50, stock: 80 },
  { name: 'Gaseosa Coca Cola 500ml', category: 'Bebidas', price: 2.50, stock: 80 },
  { name: 'Jugo Frugos 300ml', category: 'Bebidas', price: 2.00, stock: 60 },
  { name: 'Agua Cielo 2.5L', category: 'Bebidas', price: 3.50, stock: 40 },
  { name: 'Gatorade 500ml', category: 'Bebidas', price: 4.00, stock: 30 },
  { name: 'Té Lipton 400ml', category: 'Bebidas', price: 2.20, stock: 50 },
  
  // Lácteos
  { name: 'Leche Gloria 400g', category: 'Lácteos', price: 4.20, stock: 60 },
  { name: 'Leche Ideal 395g', category: 'Lácteos', price: 4.00, stock: 50 },
  { name: 'Yogurt Gloria 1L', category: 'Lácteos', price: 6.50, stock: 25 },
  { name: 'Mantequilla Laive 200g', category: 'Lácteos', price: 5.80, stock: 20 },
  { name: 'Queso Edam 250g', category: 'Lácteos', price: 8.50, stock: 15 },
  
  // Limpieza
  { name: 'Detergente Ace 500g', category: 'Limpieza', price: 5.50, stock: 40 },
  { name: 'Jabón Bolívar Barra', category: 'Limpieza', price: 2.80, stock: 50 },
  { name: 'Lejía Clorox 1L', category: 'Limpieza', price: 4.50, stock: 35 },
  { name: 'Limpiatodo Sapolio 900ml', category: 'Limpieza', price: 5.00, stock: 30 },
  { name: 'Papel Higiénico Elite x4', category: 'Limpieza', price: 6.50, stock: 40 },
  { name: 'Esponja Scotch Brite', category: 'Limpieza', price: 2.50, stock: 30 },
  
  // Snacks
  { name: 'Papas Lays 42g', category: 'Snacks', price: 2.00, stock: 50 },
  { name: 'Chifles Karinto', category: 'Snacks', price: 1.50, stock: 40 },
  { name: 'Galletas Oreo', category: 'Snacks', price: 2.50, stock: 45 },
  { name: 'Galletas Margarita', category: 'Snacks', price: 1.80, stock: 50 },
  { name: 'Doritos 45g', category: 'Snacks', price: 2.00, stock: 40 },
  
  // Licores
  { name: 'Cerveza Pilsen 630ml', category: 'Licores', price: 5.50, stock: 48 },
  { name: 'Cerveza Cristal 630ml', category: 'Licores', price: 5.50, stock: 48 },
  { name: 'Cerveza Cusqueña 330ml', category: 'Licores', price: 4.00, stock: 36 },
  { name: 'Ron Cartavio 750ml', category: 'Licores', price: 25.00, stock: 10 },
  { name: 'Pisco Quebranta 700ml', category: 'Licores', price: 35.00, stock: 8 },
  
  // Panadería
  { name: 'Pan Francés x10', category: 'Panadería', price: 2.50, stock: 20 },
  { name: 'Pan de Molde Bimbo', category: 'Panadería', price: 5.50, stock: 15 },
  { name: 'Tostadas Gali x8', category: 'Panadería', price: 3.50, stock: 25 },
  
  // Golosinas
  { name: 'Chocolate Sublime', category: 'Golosinas', price: 1.50, stock: 60 },
  { name: 'Galleta Morochas', category: 'Golosinas', price: 1.20, stock: 50 },
  { name: 'Caramelos Arcor x100', category: 'Golosinas', price: 5.00, stock: 20 },
  { name: 'Chicle Big Babol x3', category: 'Golosinas', price: 1.00, stock: 80 },
  
  // Higiene Personal
  { name: 'Shampoo Head & Shoulders 375ml', category: 'Higiene Personal', price: 15.00, stock: 20 },
  { name: 'Jabón Palmolive x3', category: 'Higiene Personal', price: 6.50, stock: 30 },
  { name: 'Pasta Dental Colgate 75ml', category: 'Higiene Personal', price: 4.50, stock: 40 },
  { name: 'Desodorante Rexona', category: 'Higiene Personal', price: 8.00, stock: 25 },
];

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.storeId) {
      return NextResponse.json({ error: 'No autenticado o sin tienda asignada' }, { status: 401 });
    }

    const storeId = user.storeId;

    // Verificar si ya hay categorías
    const existingCategories = await prisma.category.count({ where: { storeId } });
    if (existingCategories > 0) {
      return NextResponse.json({
        success: true,
        message: 'La tienda ya tiene datos',
        categoriesCreated: 0,
        productsCreated: 0,
      });
    }

    // Obtener unidad base (NIU)
    const baseUnit = await prisma.unit.findFirst({
      where: { sunatCode: 'NIU' },
    });

    if (!baseUnit) {
      return NextResponse.json(
        { error: 'Unidades SUNAT no inicializadas' },
        { status: 500 }
      );
    }

    // Crear categorías
    const categoryMap = new Map<string, string>();
    
    for (const cat of CATEGORIES_SEED) {
      const slug = generateSlug(cat.name);
      const created = await prisma.category.create({
        data: {
          storeId,
          name: cat.name,
          slug: slug,
          icon: cat.icon,
          color: cat.color,
          sortOrder: cat.order,
          active: true,
        },
      });
      categoryMap.set(cat.name, created.id);
    }

    // Crear productos
    let productsCreated = 0;
    
    for (const prod of PRODUCTS_SEED) {
      // Verificar que la categoría existe en el map
      if (!categoryMap.has(prod.category)) continue;

      // Crear ProductMaster
      const master = await prisma.productMaster.create({
        data: {
          internalSku: generateSku(),
          name: prod.name,
          category: prod.category, // String, no FK
          unitType: 'UNIT', // Default a unidad
          baseUnitId: baseUnit.id,
        },
      });

      // Crear StoreProduct
      await prisma.storeProduct.create({
        data: {
          storeId,
          productId: master.id,
          price: prod.price,
          stock: prod.stock,
          minStock: 5,
          active: true,
        },
      });

      productsCreated++;
    }

    console.log(`[seed-products] Created ${CATEGORIES_SEED.length} categories and ${productsCreated} products for store ${storeId}`);

    return NextResponse.json({
      success: true,
      categoriesCreated: CATEGORIES_SEED.length,
      productsCreated,
      message: 'Datos de ejemplo creados correctamente',
    });
  } catch (error) {
    console.error('[seed-products] Error:', error);
    return NextResponse.json(
      { error: 'Error al crear datos de ejemplo: ' + (error instanceof Error ? error.message : 'Error desconocido') },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.storeId) {
      return NextResponse.json({ needsSeed: false });
    }

    const categoryCount = await prisma.category.count({ where: { storeId: user.storeId } });
    const productCount = await prisma.storeProduct.count({ where: { storeId: user.storeId } });

    return NextResponse.json({
      needsSeed: categoryCount === 0 && productCount === 0,
      categoryCount,
      productCount,
    });
  } catch {
    return NextResponse.json({ needsSeed: false });
  }
}
