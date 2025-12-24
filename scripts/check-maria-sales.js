const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const mariaId = 'cmjitpjry00041gzgm2j73spc';
  
  console.log('\n=== Ventas de María López ===\n');

  const sales = await prisma.sale.findMany({
    where: {
      userId: mariaId,
    },
    select: {
      saleNumber: true,
      total: true,
      createdAt: true,
      paymentMethod: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`Total ventas: ${sales.length}\n`);
  sales.forEach(s => {
    console.log(`${s.saleNumber}: S/ ${s.total} - ${s.createdAt.toLocaleString('es-PE')} (${s.paymentMethod})`);
  });

  // Verificar rango 16-23 dic
  const from = new Date('2025-12-16');
  const to = new Date('2025-12-23');
  to.setHours(23, 59, 59, 999);

  const inRange = await prisma.sale.count({
    where: {
      userId: mariaId,
      createdAt: {
        gte: from,
        lte: to,
      },
    },
  });

  console.log(`\nVentas en rango 16-23 dic: ${inRange}`);

  await prisma.$disconnect();
}

main().catch(console.error);
