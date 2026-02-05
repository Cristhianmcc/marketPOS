// Limpia completamente y re-firma documentos con código corregido
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('🧹 Limpiando todo para re-firmar con código corregido...\n');
  
  // 1. Eliminar TODOS los jobs
  const deletedJobs = await p.sunatJob.deleteMany({});
  console.log(`   ✅ ${deletedJobs.count} jobs eliminados`);
  
  // 2. Resetear TODOS los documentos a DRAFT (sin firma)
  const updated = await p.electronicDocument.updateMany({
    where: {
      status: { in: ['SIGNED', 'SENT', 'ERROR'] }
    },
    data: {
      status: 'DRAFT',
      xmlSigned: null,
      hash: null,
      zipSentBase64: null,
      sunatCode: null,
      sunatMessage: null,
      sunatTicket: null,
      cdrZip: null,
    }
  });
  console.log(`   ✅ ${updated.count} documentos reseteados a DRAFT`);
  
  console.log('\n✅ Listo. Ahora ve a /sunat/documents y:');
  console.log('   1. Haz clic en el lápiz 🖊️ para firmar un documento');
  console.log('   2. Luego clic en enviar ➤ a SUNAT');
  console.log('   3. Ejecuta: npx tsx src/worker/sunatWorker.ts');
  
  await p.$disconnect();
}

main().catch(e => {
  console.error(e);
  p.$disconnect();
});
