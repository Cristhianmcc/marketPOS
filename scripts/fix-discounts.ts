import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixDiscounts() {
  console.log('🔧 Corrigiendo descuentos en ventas...\n');

  // Obtener todas las ventas activas
  const sales = await prisma.sale.findMany({
    where: {
      total: { gt: 0 }
    },
    include: {
      items: true
    }
  });

  console.log(`📊 Encontradas ${sales.length} ventas para revisar\n`);

  let updated = 0;
  
  for (const sale of sales) {
    // Sumar descuentos de todos los items
    const itemDiscounts = sale.items.reduce((sum, item) => {
      return sum + Number(item.discountAmount);
    }, 0);

    // El discountTotal actual en la BD (solo global)
    const currentDiscountTotal = Number(sale.discountTotal);
    
    // El nuevo discountTotal debe ser: descuentos de items + descuento global
    // Como no sabemos cuánto fue el global, lo calculamos restando
    const globalDiscount = Math.max(0, currentDiscountTotal - itemDiscounts);
    const correctDiscountTotal = itemDiscounts + globalDiscount;

    if (Math.abs(correctDiscountTotal - currentDiscountTotal) > 0.001) {
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          discountTotal: correctDiscountTotal
        }
      });
      
      console.log(`✅ Venta #${sale.saleNumber}: ${currentDiscountTotal.toFixed(2)} → ${correctDiscountTotal.toFixed(2)}`);
      updated++;
    }
  }

  console.log(`\n✨ Actualizado: ${updated} ventas`);
  console.log(`✅ Sin cambios: ${sales.length - updated} ventas`);
}

fixDiscounts()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
