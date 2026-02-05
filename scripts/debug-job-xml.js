// Ver el documento más reciente en cola y su XML
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Ver el último job
  const job = await p.sunatJob.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      document: true
    }
  });
  
  if (job) {
    console.log('📋 Último job:', job.id);
    console.log('   Documento:', job.document.fullNumber);
    console.log('   Fecha job:', job.createdAt);
    console.log('   Estado doc:', job.document.status);
    console.log('   XML firmado length:', job.document.xmlSigned?.length || 0);
    
    if (job.document.xmlSigned) {
      console.log('\n='.repeat(80));
      console.log('XML EN COLA (primeros 1000 chars):');
      console.log('='.repeat(80));
      console.log(job.document.xmlSigned.substring(0, 1000));
    }
  } else {
    console.log('No hay jobs');
  }
  
  await p.$disconnect();
}

main().catch(e => {
  console.error(e);
  p.$disconnect();
});