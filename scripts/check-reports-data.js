const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\n=== Verificando datos para reportes ===\n');

  // Contar ventas totales
  const totalSales = await prisma.sale.count();
  console.log(`Total de ventas en DB: ${totalSales}`);

  // Ventas últimos 7 días
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = new Date();
  
  const recentSales = await prisma.sale.findMany({
    where: {
      createdAt: {
        gte: from,
        lte: to,
      },
    },
    select: {
      id: true,
      saleNumber: true,
      total: true,
      createdAt: true,
      userId: true,
    },
    take: 10,
  });

  console.log(`\nVentas últimos 7 días: ${recentSales.length}`);
  recentSales.forEach(s => {
    console.log(`  - ${s.saleNumber}: S/ ${s.total} (${s.createdAt.toLocaleDateString()}) - User: ${s.userId}`);
  });

  // Turnos cerrados
  const closedShifts = await prisma.shift.count({
    where: {
      closedAt: { not: null },
    },
  });
  console.log(`\nTurnos cerrados: ${closedShifts}`);

  // Sale items
  const itemsCount = await prisma.saleItem.count();
  console.log(`Items vendidos (total): ${itemsCount}`);

  await prisma.$disconnect();
}

main().catch(console.error);
