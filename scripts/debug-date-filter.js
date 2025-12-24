const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const mariaId = 'cmjitpjry00041gzgm2j73spc';
  
  // Simular el filtro del frontend
  const from = new Date('2025-12-16');
  const to = new Date('2025-12-23');
  to.setHours(23, 59, 59, 999);

  console.log('\n=== Rango de fechas ===');
  console.log(`Desde: ${from.toISOString()}`);
  console.log(`Hasta: ${to.toISOString()}\n`);

  const sales = await prisma.sale.findMany({
    where: {
      userId: mariaId,
      createdAt: {
        gte: from,
        lte: to,
      },
    },
    select: {
      saleNumber: true,
      total: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`Ventas encontradas: ${sales.length}\n`);
  sales.forEach(s => {
    console.log(`${s.saleNumber}: S/ ${s.total} - ${s.createdAt.toISOString()}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
