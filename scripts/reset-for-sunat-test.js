const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // 1. Resetear documentos ERROR a SIGNED
  const docsReset = await p.electronicDocument.updateMany({
    where: { status: 'ERROR' },
    data: { 
      status: 'SIGNED',
      sunatCode: null,
      sunatMessage: null
    }
  });
  console.log('✅ Documentos reseteados a SIGNED:', docsReset.count);
  
  // 2. Eliminar jobs viejos
  const jobsDeleted = await p.sunatJob.deleteMany({});
  console.log('✅ Jobs eliminados:', jobsDeleted.count);
  
  // 3. Verificar credenciales
  const settings = await p.sunatSettings.findFirst({
    include: { store: { select: { ruc: true } } }
  });
  
  console.log('\n📋 Configuración SUNAT:');
  console.log(`   RUC: ${settings?.store?.ruc}`);
  console.log(`   Usuario SOL: ${settings?.solUser}`);
  console.log(`   Ambiente: ${settings?.env}`);
  
  // 4. Documentos SIGNED listos
  const docs = await p.electronicDocument.findMany({
    where: { status: 'SIGNED' },
    select: { fullNumber: true, status: true }
  });
  console.log('\n📄 Documentos SIGNED listos para enviar:', docs.length);
  docs.forEach(d => console.log(`   - ${d.fullNumber}`));
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
