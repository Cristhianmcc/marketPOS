const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const RUC = '10746250211';
  const USUARIO_SOL = 'USSER111';
  const PASSWORD_SOL = 'Qwert12345';
  
  // Usuario SOL completo: RUC + USUARIO
  const solUserCompleto = RUC + USUARIO_SOL;
  
  console.log('\n🔧 Actualizando credenciales SOL...');
  console.log(`   Usuario SOL: ${solUserCompleto}`);
  
  // Actualizar settings SUNAT
  const result = await p.sunatSettings.updateMany({
    data: {
      solUser: solUserCompleto,
      solPass: PASSWORD_SOL,
    }
  });
  
  console.log(`\n✅ Credenciales actualizadas: ${result.count} tienda(s)`);
  
  // Resetear jobs fallidos para reintento
  const jobsReset = await p.sunatJob.updateMany({
    where: { status: 'FAILED' },
    data: { 
      status: 'QUEUED',
      nextRunAt: new Date(),
      attempts: 0,
      lastError: null
    }
  });
  
  console.log(`✅ Jobs reseteados para reintento: ${jobsReset.count}`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
