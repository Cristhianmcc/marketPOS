const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Actualizar nextRunAt para que los jobs se procesen ahora
  const result = await p.sunatJob.updateMany({
    where: { status: 'QUEUED' },
    data: { nextRunAt: new Date() }
  });
  
  console.log('✅ Jobs actualizados:', result.count);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
