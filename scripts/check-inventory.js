/**
 * Script para ver el estado actual del inventario
 * Ejecutar: node scripts/check-inventory.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('📦 Estado actual del inventario:\n');

  const products = await prisma.storeProduct.findMany({
    include: {
      product: {
        select: {
          name: true,
          internalSku: true,
          unitType: true
        }
      }
    },
    orderBy: {
      stock: 'asc'
    }
  });

  console.log('Total productos:', products.length);
  console.log('\n📋 Listado:\n');

  for (const sp of products) {
    const stockStr = sp.stock !== null ? sp.stock.toString() : 'null';
    const stockColor = sp.stock !== null && sp.stock <= 0 ? '🔴' : sp.stock !== null && sp.stock <= 5 ? '🟡' : '🟢';
    
    console.log(`${stockColor} ${sp.product.name}`);
    console.log(`   SKU: ${sp.product.internalSku}`);
    console.log(`   Stock: ${stockStr} | Precio: S/ ${sp.price} | Tipo: ${sp.product.unitType}`);
    console.log(`   Activo: ${sp.active ? 'Sí' : 'No'}\n`);
  }

  // Estadísticas
  const withStock = products.filter(p => p.stock !== null && p.stock > 0).length;
  const lowStock = products.filter(p => p.stock !== null && p.stock > 0 && p.stock <= 5).length;
  const noStock = products.filter(p => p.stock !== null && p.stock <= 0).length;
  const nullStock = products.filter(p => p.stock === null).length;

  console.log('\n📊 Estadísticas:');
  console.log(`   🟢 Con stock: ${withStock}`);
  console.log(`   🟡 Stock bajo (≤5): ${lowStock}`);
  console.log(`   🔴 Sin stock (≤0): ${noStock}`);
  console.log(`   ⚪ Stock no controlado: ${nullStock}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
