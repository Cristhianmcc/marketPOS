// scripts/cleanup-wrong-demo-sales.js
// Script para limpiar ventas con números demo pero marcadas como reales

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🧹 Limpiando ventas mal marcadas...\n');

    // Buscar ventas con números demo (>=99991) pero marcadas como reales (isDemo: false)
    const wrongSales = await prisma.sale.findMany({
      where: {
        saleNumber: { gte: 99991 },
        isDemo: false
      },
      include: {
        store: true,
        items: true
      }
    });

    if (wrongSales.length === 0) {
      console.log('✅ No hay ventas mal marcadas. Todo está bien.\n');
      return;
    }

    console.log(`⚠️  Encontradas ${wrongSales.length} ventas mal marcadas:\n`);
    
    for (const sale of wrongSales) {
      console.log(`   #${sale.saleNumber} - ${sale.store.name} - S/ ${sale.total}`);
    }

    console.log(`\n🔧 Corrigiendo ahora...\n`);

    // Eliminar estas ventas usando una transacción
    const result = await prisma.$transaction(async (tx) => {
      // Primero eliminar los items
      const deletedItems = await tx.saleItem.deleteMany({
        where: {
          saleId: { in: wrongSales.map(s => s.id) }
        }
      });

      // Luego eliminar las ventas
      const deletedSales = await tx.sale.deleteMany({
        where: {
          id: { in: wrongSales.map(s => s.id) }
        }
      });

      // También eliminar movimientos relacionados si tienen números demo
      const deletedMovements = await tx.movement.deleteMany({
        where: {
          notes: {
            in: wrongSales.map(s => `Venta #${s.saleNumber}`)
          }
        }
      });

      return {
        deletedSales: deletedSales.count,
        deletedItems: deletedItems.count,
        deletedMovements: deletedMovements.count
      };
    });

    console.log('✅ Limpieza completada:\n');
    console.log(`   - Ventas eliminadas: ${result.deletedSales}`);
    console.log(`   - Items eliminados: ${result.deletedItems}`);
    console.log(`   - Movimientos eliminados: ${result.deletedMovements}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
