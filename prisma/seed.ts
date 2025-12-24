import { PrismaClient, UnitType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Hash password for test users
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1. Create store
  const store = await prisma.store.create({
    data: {
      name: 'Bodega El Mercado',
      ruc: '20123456789',
      address: 'Av. Los Olivos 123, Lima',
      phone: '987654321',
    },
  });
  console.log('✅ Store created:', store.name);

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
      name: 'María López',
      password: hashedPassword,
      role: 'CASHIER',
    },
  });
  console.log('✅ Users created:', owner.name, cashier.name);

  // 3. Create products master (catálogo base) - unitType ahora en ProductMaster
  const productsData = [
    // Productos con código de barras (UNIT)
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
      barcode: '7750912003344',
      internalSku: 'SKU-003',
      name: 'Chizitos 30g',
      brand: 'Frito Lay',
      content: '30 g',
      category: 'Snacks',
      unitType: UnitType.UNIT,
    },
    {
      barcode: '7750885007890',
      internalSku: 'SKU-004',
      name: 'Sublime Clásico',
      brand: 'Nestlé',
      content: '30 g',
      category: 'Golosinas',
      unitType: UnitType.UNIT,
    },
    {
      barcode: '7750103000123',
      internalSku: 'SKU-005',
      name: 'Leche Gloria Entera 1L',
      brand: 'Gloria',
      content: '1 L',
      category: 'Lácteos',
      unitType: UnitType.UNIT,
    },
    {
      barcode: '7751271001234',
      internalSku: 'SKU-006',
      name: 'Pilsen Callao 650ml',
      brand: 'Backus',
      content: '650 ml',
      category: 'Bebidas Alcohólicas',
      unitType: UnitType.UNIT,
    },
    },

    // Productos sin código de barras (UNIT)
    {
      barcode: null,
      internalSku: 'INT-001',
      name: 'Pan Francés',
      brand: null,
      content: 'unidad',
      category: 'Panadería',
      unitType: UnitType.UNIT,
    },
    {
      barcode: null,
      internalSku: 'INT-002',
      name: 'Huevos',
      brand: null,
      content: 'unidad',
      category: 'Abarrotes',
      unitType: UnitType.UNIT,
    },

    // Productos por peso (KG)
    {
      barcode: null,
      internalSku: 'INT-003',
      name: 'Papa Blanca',
      brand: null,
      content: 'kg',
      category: 'Verduras',
      unitType: UnitType.KG,
    },
    {
      barcode: null,
      internalSku: 'INT-004',
      name: 'Cebolla Roja',
      brand: null,
      content: 'kg',
      category: 'Verduras',
      unitType: UnitType.KG,
    },
    {
      barcode: null,
      internalSku: 'INT-005',
      name: 'Arroz a Granel',
      brand: null,
      content: 'kg',
      category: 'Abarrotes',
      unitType: UnitType.KG,
    },
    {
      barcode: null,
      internalSku: 'INT-006',
      name: 'Azúcar Rubia',
      brand: null,
      content: 'kg',
      category: 'Abarrotes',
      unitType: UnitType.KG,
    },
  ];

  const products = await Promise.all(
    productsData.map((p) =>
      prisma.productMaster.create({
        data: p,
      })
    )
  );
  console.log(`✅ ${products.length} products created`);

  // 4. Create store products (precios y stock por tienda) - SIN unitType
  const storeProductsData = [
    // Productos con código
    { productId: products[0].id, price: 2.5, stock: 100 },
    { productId: products[1].id, price: 4.0, stock: 80 },
    { productId: products[2].id, price: 1.0, stock: 150 },
    { productId: products[3].id, price: 1.5, stock: 200 },
    { productId: products[4].id, price: 5.5, stock: 50 },
    { productId: products[5].id, price: 6.0, stock: 60 },

    // Productos sin código
    { productId: products[6].id, price: 0.3, stock: 200 },
    { productId: products[7].id, price: 0.5, stock: 300 },

    // Productos por peso (stock nullable)
    { productId: products[8].id, price: 3.5, stock: null },
    { productId: products[9].id, price: 4.0, stock: null },
    { productId: products[10].id, price: 4.2, stock: null },
    { productId: products[11].id, price: 3.8, stock: null },
  ];

  await Promise.all(
    storeProductsData.map((sp) =>
      prisma.storeProduct.create({
        data: {
          storeId: store.id,
          ...sp,
        },
      })
    )
  );
  console.log('✅ Store products created with prices and stock');

  // 5. Create store settings
  await prisma.storeSettings.create({
    data: {
      storeId: store.id,
      ticketFooter: 'Gracias por su compra\nBodega El Mercado',
      taxRate: 0,
    },
  });
  console.log('✅ Store settings created');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
