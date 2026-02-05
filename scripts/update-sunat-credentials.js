const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Datos proporcionados
  const RUC = '10746250211';
  const USUARIO_SOL = '74625021';  // Usuario secundario
  const PASSWORD_SOL = 'Kikomoreno1';
  
  // El usuario SOL para SUNAT web services es: RUC + USUARIO
  const solUserCompleto = RUC + USUARIO_SOL;
  
  console.log('\n🔧 Actualizando configuración SUNAT...');
  console.log(`   RUC: ${RUC}`);
  console.log(`   Usuario SOL completo: ${solUserCompleto}`);
  
  // 1. Actualizar RUC de la tienda
  const store = await p.store.findFirst();
  if (!store) {
    console.error('❌ No se encontró tienda');
    return;
  }
  
  await p.store.update({
    where: { id: store.id },
    data: { ruc: RUC }
  });
  console.log(`\n✅ RUC de tienda actualizado: ${RUC}`);
  
  // 2. Actualizar settings SUNAT
  const settings = await p.sunatSettings.findFirst({
    where: { storeId: store.id }
  });
  
  if (!settings) {
    console.error('❌ No se encontró SunatSettings');
    return;
  }
  
  await p.sunatSettings.update({
    where: { id: settings.id },
    data: {
      solUser: solUserCompleto,
      solPass: PASSWORD_SOL,
      env: 'BETA', // Asegurar que es BETA (homologación)
    }
  });
  
  console.log(`✅ Usuario SOL actualizado: ${solUserCompleto}`);
  console.log(`✅ Contraseña SOL actualizada: ******`);
  console.log(`✅ Ambiente: BETA (Homologación)`);
  
  // Verificar
  const updated = await p.sunatSettings.findFirst({
    where: { storeId: store.id },
    include: { store: { select: { ruc: true, name: true } } }
  });
  
  console.log('\n📋 Configuración final:');
  console.log(`   Tienda: ${updated.store.name}`);
  console.log(`   RUC: ${updated.store.ruc}`);
  console.log(`   Usuario SOL: ${updated.solUser}`);
  console.log(`   Ambiente: ${updated.env}`);
  console.log(`   Certificado: ${updated.certPfxBase64 ? '✅ Presente' : '❌ Falta configurar'}`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
