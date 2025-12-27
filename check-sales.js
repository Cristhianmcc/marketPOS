const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSales() {
  try {
    // Get sales 50 and 51
    const sales = await prisma.sale.findMany({
      where: {
        saleNumber: {
          in: [50, 51]
        }
      },
      include: {
        items: true
      },
      orderBy: {
        saleNumber: 'asc'
      }
    });

    console.log('\n=== VENTAS #50 y #51 ===\n');
    
    for (const sale of sales) {
      console.log(`\n📋 VENTA ${sale.saleNumber}`);
      console.log(`Total: S/ ${sale.total}`);
      console.log(`Items: ${sale.items.length}\n`);
      
      for (const item of sale.items) {
        console.log(`  Item: ${item.productName}`);
        console.log(`  Quantity: ${item.quantity}`);
        console.log(`  Unit Price: S/ ${item.unitPrice}`);
        console.log(`  Subtotal: S/ ${item.subtotal}`);
        console.log(`  Promotion Discount: S/ ${item.promotionDiscount || 0}`);
        console.log(`  Category Promo Name: ${item.categoryPromoName || 'NULL'}`);
        console.log(`  Category Promo Type: ${item.categoryPromoType || 'NULL'}`);
        console.log(`  Category Promo Discount: S/ ${item.categoryPromoDiscount || 0}`);
        console.log(`  Manual Discount: S/ ${item.discountAmount || 0}`);
        console.log(`  Total Line: S/ ${item.totalLine}\n`);
      }
    }

    // Calculate category promotions total
    for (const sale of sales) {
      const categoryPromotionsTotal = sale.items.reduce((sum, item) => {
        return sum + (item.categoryPromoDiscount ? Number(item.categoryPromoDiscount) : 0);
      }, 0);
      console.log(`\n✅ ${sale.saleNumber} - Category Promos Total: S/ ${categoryPromotionsTotal.toFixed(2)}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSales();
