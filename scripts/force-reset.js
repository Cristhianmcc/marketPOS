const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const jobs = await p.sunatJob.deleteMany({});
  console.log('Jobs eliminados:', jobs.count);
  
  const docs = await p.electronicDocument.updateMany({
    data: { 
      status: 'DRAFT', 
      xmlSigned: null, 
      hash: null, 
      zipSentBase64: null, 
      sunatCode: null, 
      sunatMessage: null, 
      sunatTicket: null, 
      cdrZip: null 
    }
  });
  console.log('Docs reseteados:', docs.count);
  
  await p.$disconnect();
}

main();
