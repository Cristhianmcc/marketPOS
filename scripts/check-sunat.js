// scripts/check-sunat.js
// Script para verificar la configuración SUNAT en la base de datos

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSunat() {
  console.log('🔍 Verificando módulo SUNAT...\n');

  try {
    // 1. Verificar SunatSettings
    const settings = await prisma.sunatSettings.findMany({
      include: {
        store: {
          select: { name: true }
        }
      }
    });

    console.log(`📋 Configuraciones SUNAT encontradas: ${settings.length}`);
    settings.forEach(s => {
      console.log(`  - ${s.store.name}:`);
      console.log(`    • Entorno: ${s.env}`);
      console.log(`    • Habilitado: ${s.enabled ? '✅' : '❌'}`);
      console.log(`    • Series: F:${s.defaultFacturaSeries}, B:${s.defaultBoletaSeries}`);
      console.log(`    • Próximos números: F:${s.nextFacturaNumber}, B:${s.nextBoletaNumber}`);
    });

    // 2. Verificar ElectronicDocuments
    const docs = await prisma.electronicDocument.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\n📄 Documentos electrónicos: ${docs.length}`);
    docs.forEach(d => {
      console.log(`  - ${d.fullNumber} (${d.docType}): ${d.status}`);
      console.log(`    Cliente: ${d.customerName} - Total: S/ ${d.total}`);
    });

    // 3. Verificar Feature Flag
    const flags = await prisma.featureFlag.findMany({
      where: { key: 'ENABLE_SUNAT' }
    });

    console.log(`\n🚩 Feature Flag ENABLE_SUNAT: ${flags.length > 0 ? 'Creado' : 'No encontrado'}`);
    flags.forEach(f => {
      console.log(`  - Store: ${f.storeId}, Enabled: ${f.enabled ? '✅' : '❌'}`);
    });

    // 4. Verificar Audit Logs SUNAT
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'SUNAT' },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\n📝 Audit Logs SUNAT: ${auditLogs.length}`);
    auditLogs.forEach(log => {
      console.log(`  - ${log.action} (${log.severity})`);
      console.log(`    ${new Date(log.createdAt).toLocaleString()}`);
    });

    console.log('\n✅ Verificación completada');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSunat();
