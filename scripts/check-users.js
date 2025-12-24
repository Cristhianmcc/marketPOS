const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\n=== Usuarios en el sistema ===\n');

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  users.forEach(u => {
    console.log(`${u.name} (${u.email})`);
    console.log(`  Role: ${u.role}`);
    console.log(`  ID: ${u.id}\n`);
  });

  // Contar ventas por usuario
  console.log('=== Ventas por usuario ===\n');
  for (const user of users) {
    const count = await prisma.sale.count({
      where: { userId: user.id },
    });
    console.log(`${user.name}: ${count} ventas`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
