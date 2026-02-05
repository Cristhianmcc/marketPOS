const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Resetear jobs FAILED a QUEUED
  const r = await p.sunatJob.updateMany({
    where: { status: 'FAILED' },
    data: {
      status: 'QUEUED',
      nextRunAt: new Date(),
      attempts: 0,
      lastError: null
    }
  });
  
  console.log('✅ Jobs reseteados:', r.count);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
