const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Jobs pendientes
  const pending = await p.sunatJob.findMany({ 
    where: { status: 'PENDING' }, 
    take: 20,
    orderBy: { createdAt: 'desc' }
  });
  console.log('\n📋 Jobs PENDING:', pending.length);
  pending.forEach(j => console.log('  -', j.id, j.action, j.documentId?.substring(0,8)));
  
  // Documentos sin SENT
  const docs = await p.electronicDocument.findMany({
    where: { status: { not: 'ACCEPTED' } },
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fullNumber: true,
      status: true,
      createdAt: true
    }
  });
  console.log('\n📄 Documentos NO ACCEPTED:', docs.length);
  docs.forEach(d => console.log('  -', d.fullNumber, d.status));
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
