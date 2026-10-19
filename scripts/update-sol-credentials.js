const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const RUC = String(process.env.SUNAT_RUC || '').trim();
  const USUARIO_SOL = String(process.env.SUNAT_SOL_USER || '').trim();
  const PASSWORD_SOL = String(process.env.SUNAT_SOL_PASS || '');

  if (!/^\d{11}$/.test(RUC) || !USUARIO_SOL || !PASSWORD_SOL) {
    throw new Error('Configura SUNAT_RUC, SUNAT_SOL_USER y SUNAT_SOL_PASS');
  }
  
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
