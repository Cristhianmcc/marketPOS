// Script para crear una venta de prueba que se usará con SUNAT
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestSale() {
  try {
    console.log('🛒 Creando venta de prueba para SUNAT...\n');

    const store = await prisma.store.findFirst();
    if (!store) {
      console.log('❌ No hay tiendas');
      return;
    }

    const user = await prisma.user.findFirst({
      where: { storeId: store.id, role: 'OWNER' }
    });

    if (!user) {
      console.log('❌ No hay usuarios');
      return;
    }

    // Obtener productos
    const products = await prisma.storeProduct.findMany({
      where: { storeId: store.id },
      include: { product: true },
      take: 3
    });

    if (products.length === 0) {
      console.log('❌ No hay productos');
      return;
    }

    // Crear venta con customer para FACTURA
    const saleWithRUC = await prisma.sale.create({
      data: {
        storeId: store.id,
        userId: user.id,
        saleNumber: 9999, // Número de prueba
        total: 500.00,
        subtotal: 423.73,
        tax: 76.27,
        paymentMethod: 'CASH',
        customerDocType: 'RUC',
        customerDocNumber: '20123456789',
        customerName: 'EMPRESA DE PRUEBA SAC',
        customerAddress: 'Av. Javier Prado 1234, San Isidro, Lima',
        items: {
          create: products.slice(0, 2).map((sp, idx) => ({
            productId: sp.productId,
            productName: sp.product.name,
            productContent: sp.product.content,
            quantity: idx + 1,
            unitPrice: 100.00,
            subtotal: (idx + 1) * 100.00,
          }))
        }
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    console.log('✅ Venta con RUC creada:');
    console.log(`   ID: ${saleWithRUC.id}`);
    console.log(`   Cliente: ${saleWithRUC.customerName}`);
    console.log(`   RUC: ${saleWithRUC.customerDocNumber}`);
    console.log(`   Total: S/ ${saleWithRUC.total.toFixed(2)}`);
    console.log(`   Items: ${saleWithRUC.items.length}\n`);

    // Crear venta con DNI para BOLETA
    const saleWithDNI = await prisma.sale.create({
      data: {
        storeId: store.id,
        userId: user.id,
        saleNumber: 10000,
        total: 100.00,
        subtotal: 84.75,
        tax: 15.25,
        paymentMethod: 'CASH',
        customerDocType: 'DNI',
        customerDocNumber: '12345678',
        customerName: 'Juan Pérez García',
        items: {
          create: [{
            productId: products[0].productId,
            productName: products[0].product.name,
            productContent: products[0].product.content,
            quantity: 2,
            unitPrice: 50.00,
            subtotal: 100.00,
          }]
        }
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    console.log('✅ Venta con DNI creada:');
    console.log(`   ID: ${saleWithDNI.id}`);
    console.log(`   Cliente: ${saleWithDNI.customerName}`);
    console.log(`   DNI: ${saleWithDNI.customerDocNumber}`);
    console.log(`   Total: S/ ${saleWithDNI.total.toFixed(2)}`);
    console.log(`   Items: ${saleWithDNI.items.length}\n`);

    console.log('═══════════════════════════════════════════════');
    console.log('📋 IDs para probar el payload:\n');
    console.log(`Para FACTURA: ${saleWithRUC.id}`);
    console.log(`Para BOLETA: ${saleWithDNI.id}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestSale();
