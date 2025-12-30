// scripts/check-demo-mode.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDemoMode() {
  try {
    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        isDemoStore: true,
        status: true,
      },
    });

    console.log('\n📊 Estado de Demo Mode:\n');
    stores.forEach(store => {
      console.log(`🏪 ${store.name} (${store.id})`);
      console.log(`   Status: ${store.status}`);
      console.log(`   Demo Mode: ${store.isDemoStore ? '✅ ACTIVO' : '❌ INACTIVO'}`);
      console.log('');
    });

    // Contar productos demo
    if (stores.some(s => s.isDemoStore)) {
      const products = await prisma.productMaster.count({
        where: {
          name: {
            contains: 'Demo',
            mode: 'insensitive',
          },
        },
      });
      console.log(`📦 Productos demo encontrados: ${products}`);

      const sales = await prisma.sale.count({
        where: {
          saleNumber: {
            gte: 99991,
            lte: 99993,
          },
        },
      });
      console.log(`🛒 Ventas demo encontradas: ${sales}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDemoMode();
