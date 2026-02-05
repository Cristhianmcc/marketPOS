// Script simplificado: usar una venta existente para probar el payload
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listSales() {
  try {
    console.log('📋 Ventas disponibles para probar payload SUNAT:\n');

    const sales = await prisma.sale.findMany({
      include: {
        items: true,
        customer: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (sales.length === 0) {
      console.log('❌ No hay ventas. Ejecuta primero el checkout para crear ventas.\n');
      return;
    }

    sales.forEach((sale, i) => {
      console.log(`${i + 1}. Sale #${sale.saleNumber}`);
      console.log(`   ID: ${sale.id}`);
      console.log(`   Total: S/ ${sale.total.toFixed(2)}`);
      console.log(`   Items: ${sale.items.length}`);
      console.log(`   Customer: ${sale.customer?.name || '(sin cliente)'}`);
      console.log(`   Customer Doc: ${sale.customer?.docNumber || 'N/A'}`);
      console.log(`   Fecha: ${sale.createdAt.toLocaleString('es-PE')}\n`);
    });

    if (sales.length > 0) {
      console.log('═══════════════════════════════════════════════');
      console.log('💡 Para probar el payload, usa uno de estos IDs:');
      console.log(`\nPara BOLETA: ${sales[0].id}`);
      if (sales.length > 1) {
        console.log(`Para FACTURA: ${sales[1].id} (si tiene customer con RUC)\n`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

listSales();
