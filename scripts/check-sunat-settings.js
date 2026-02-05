const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Settings SUNAT
  const settings = await p.sunatSettings.findMany({
    include: {
      store: {
        select: { id: true, name: true, ruc: true }
      }
    }
  });
  
  console.log('\n🏪 SUNAT Settings:');
  settings.forEach(s => {
    console.log(`\n📍 Tienda: ${s.store.name}`);
    console.log(`   RUC: ${s.store.ruc}`);
    console.log(`   Habilitado: ${s.enabled ? '✅' : '❌'}`);
    console.log(`   Ambiente: ${s.env}`);
    console.log(`   SOL User: ${s.solUser || '(vacío)'}`);
    console.log(`   SOL Pass: ${s.solPass ? '***' : '(vacío)'}`);
    console.log(`   Certificado: ${s.certPfxBase64 ? '✅ Presente' : '❌ No configurado'}`);
    console.log(`   Serie BOLETA: ${s.serieBoleta || '(vacío)'}`);
    console.log(`   Serie FACTURA: ${s.serieFactura || '(vacío)'}`);
  });
  
  // ENV vars para SUNAT
  console.log('\n\n🔧 Variables de entorno:');
  console.log(`   ENABLE_SUNAT: ${process.env.ENABLE_SUNAT}`);
  console.log(`   SUNAT_SOL_USER: ${process.env.SUNAT_SOL_USER || '(no definido)'}`);
  console.log(`   SUNAT_SOL_PASS: ${process.env.SUNAT_SOL_PASS ? '***' : '(no definido)'}`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
