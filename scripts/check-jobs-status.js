const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Jobs por status
  const queued = await p.sunatJob.findMany({ where: { status: 'QUEUED' } });
  const done = await p.sunatJob.findMany({ where: { status: 'DONE' } });
  const failed = await p.sunatJob.findMany({ where: { status: 'FAILED' } });
  const pending = await p.sunatJob.findMany({ where: { status: 'PENDING' } });
  
  console.log('\n📊 Jobs por estado:');
  console.log(`   QUEUED: ${queued.length}`);
  console.log(`   PENDING: ${pending.length}`);
  console.log(`   DONE: ${done.length}`);
  console.log(`   FAILED: ${failed.length}`);
  
  if (queued.length > 0) {
    console.log('\n📋 Jobs QUEUED:');
    const now = new Date();
    queued.forEach(j => {
      const ready = j.nextRunAt <= now && !j.lockedAt;
      console.log(`   ${j.id.slice(0,8)} | nextRunAt: ${j.nextRunAt?.toISOString()} | locked: ${!!j.lockedAt} | ready: ${ready ? '✅' : '❌'}`);
    });
  }
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
