// scripts/debug-demo-sales.js
// Script temporal para revisar las ventas y su estado demo

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 Revisando ventas en la base de datos...\n');

    // Obtener la tienda
    const stores = await prisma.store.findMany({
      select: { 
        id: true, 
        name: true, 
        isDemoStore: true 
      }
    });

    for (const store of stores) {
      console.log(`\n📦 Tienda: ${store.name} (${store.id})`);
      console.log(`   Demo Mode: ${store.isDemoStore ? '✅ ACTIVO' : '❌ INACTIVO'}\n`);

      // Obtener todas las ventas
      const allSales = await prisma.sale.findMany({
        where: { storeId: store.id },
        select: {
          id: true,
          saleNumber: true,
          isDemo: true,
          total: true,
          createdAt: true,
        },
        orderBy: { saleNumber: 'asc' }
      });

      if (allSales.length === 0) {
        console.log('   No hay ventas en esta tienda.\n');
        continue;
      }

      console.log(`   Total de ventas: ${allSales.length}\n`);

      // Agrupar por tipo
      const realSales = allSales.filter(s => !s.isDemo);
      const demoSales = allSales.filter(s => s.isDemo);

      console.log(`   ✅ Ventas REALES (isDemo: false): ${realSales.length}`);
      if (realSales.length > 0) {
        realSales.forEach(s => {
          console.log(`      #${s.saleNumber} - S/ ${s.total} - ${s.createdAt.toLocaleString()}`);
        });
      }

      console.log(`\n   🎭 Ventas DEMO (isDemo: true): ${demoSales.length}`);
      if (demoSales.length > 0) {
        demoSales.forEach(s => {
          console.log(`      #${s.saleNumber} - S/ ${s.total} - ${s.createdAt.toLocaleString()}`);
        });
      }

      // Detectar anomalías
      console.log('\n   🔎 Diagnóstico:');
      
      const normalRangeDemoSales = demoSales.filter(s => s.saleNumber < 90000);
      if (normalRangeDemoSales.length > 0) {
        console.log(`      ⚠️  PROBLEMA: ${normalRangeDemoSales.length} ventas demo con números normales (<90000)`);
        normalRangeDemoSales.forEach(s => {
          console.log(`         - Venta #${s.saleNumber} marcada como demo pero tiene número normal`);
        });
      }

      const demoRangeRealSales = realSales.filter(s => s.saleNumber >= 99991);
      if (demoRangeRealSales.length > 0) {
        console.log(`      ⚠️  PROBLEMA: ${demoRangeRealSales.length} ventas reales con números demo (>=99991)`);
        demoRangeRealSales.forEach(s => {
          console.log(`         - Venta #${s.saleNumber} marcada como real pero tiene número demo`);
        });
      }

      if (store.isDemoStore && demoSales.length > 0) {
        console.log(`      ⚠️  PROBLEMA: Demo Mode activo pero hay ventas demo sin eliminar`);
      }

      if (!store.isDemoStore && demoSales.length === 0 && realSales.length > 0) {
        console.log(`      ✅ TODO BIEN: Solo ventas reales y demo inactivo`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
