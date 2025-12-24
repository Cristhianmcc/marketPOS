/**
 * Script para corregir stock negativo
 * Ejecutar: node scripts/fix-negative-stock.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Corrigiendo productos con stock negativo...\n');

  // Buscar productos con stock negativo
  const negativeStock = await prisma.storeProduct.findMany({
    where: {
      stock: {
        lt: 0
      }
    },
    include: {
      product: {
        select: {
          name: true,
          internalSku: true
        }
      }
    }
  });

  if (negativeStock.length === 0) {
    console.log('✅ No hay productos con stock negativo.');
    return;
  }

  console.log(`⚠️  Encontrados ${negativeStock.length} productos con stock negativo:\n`);
  
  for (const sp of negativeStock) {
    console.log(`   - ${sp.product.name} (${sp.product.internalSku}): Stock ${sp.stock}`);
  }

  // Actualizar a 0
  const result = await prisma.storeProduct.updateMany({
    where: {
      stock: {
        lt: 0
      }
    },
    data: {
      stock: 0
    }
  });

  console.log(`\n✅ ${result.count} productos actualizados a stock = 0`);
  console.log('\n💡 Tip: Ahora puedes hacer una entrada de inventario para ajustar el stock real.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
