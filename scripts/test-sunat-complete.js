// Script completo para probar el módulo SUNAT
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSunat() {
  try {
    console.log('🧪 PRUEBA COMPLETA DEL MÓDULO SUNAT\n');
    console.log('═══════════════════════════════════════════════\n');

    // 1. Verificar feature flag
    console.log('1️⃣  Verificando Feature Flag ENABLE_SUNAT...');
    const store = await prisma.store.findFirst();
    
    if (!store) {
      console.log('❌ No hay tiendas en la DB');
      return;
    }

    const flag = await prisma.featureFlag.findUnique({
      where: {
        storeId_key: {
          storeId: store.id,
          key: 'ENABLE_SUNAT'
        }
      }
    });

    console.log(`   Store: ${store.name}`);
    console.log(`   ENABLE_SUNAT: ${flag?.enabled ? '✅ ACTIVO' : '❌ INACTIVO'}\n`);

    if (!flag?.enabled) {
      console.log('⚠️  El feature flag no está activo. Actívalo desde /admin/feature-flags\n');
      return;
    }

    // 2. Verificar/Inicializar configuración SUNAT
    console.log('2️⃣  Verificando SunatSettings...');
    let sunatSettings = await prisma.sunatSettings.findUnique({
      where: { storeId: store.id }
    });

    if (!sunatSettings) {
      console.log('   No existe, creando configuración inicial...');
      sunatSettings = await prisma.sunatSettings.create({
        data: {
          storeId: store.id,
          env: 'BETA',
          enabled: false,
          defaultFacturaSeries: 'F001',
          defaultBoletaSeries: 'B001',
          defaultNotaCreditoSeries: 'FC01',
          defaultNotaDebitoSeries: 'FD01',
          nextFacturaNumber: 1,
          nextBoletaNumber: 1,
          nextNotaCreditoNumber: 1,
          nextNotaDebitoNumber: 1,
        }
      });
    }

    console.log(`   Entorno: ${sunatSettings.env}`);
    console.log(`   Habilitado: ${sunatSettings.enabled ? 'Sí' : 'No'}`);
    console.log(`   Series: F:${sunatSettings.defaultFacturaSeries}, B:${sunatSettings.defaultBoletaSeries}`);
    console.log(`   Próximos números: F:${sunatSettings.nextFacturaNumber}, B:${sunatSettings.nextBoletaNumber}\n`);

    // 3. Listar documentos existentes
    console.log('3️⃣  Documentos electrónicos existentes:');

    const docs = await prisma.electronicDocument.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (docs.length === 0) {
      console.log('   (No hay documentos aún)\n');
      console.log('   💡 Para crear documentos de prueba, usa el endpoint:');
      console.log('      POST http://localhost:3000/api/sunat/test-draft\n');
    } else {
      console.log(`   Total: ${docs.length} documentos\n`);
      docs.forEach((doc, i) => {
        console.log(`   ${i + 1}. ${doc.fullNumber} - ${doc.docType}`);
        console.log(`      Cliente: ${doc.customerName}`);
        console.log(`      Total: S/ ${doc.total}`);
        console.log(`      Estado: ${doc.status}`);
       4. Verificar audit logs
    console.log('4
    }

    // 7. Verificar audit logs
    console.log('7️⃣  Últimos logs de auditoría SUNAT:');
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'SUNAT' },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (auditLogs.length === 0) {
      console.log('   (No hay logs de auditoría aún)\n');
    } else {
      auditLogs.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.action} - ${log.severity}`);
        console.log(`      ${log.createdAt.toLocaleString('es-PE')}\n`);
      });
    }

    console.log('═══════════════════════════════════════════════');
    console.log('✅ PRUEBA COMPLETADA\n');
    console.log('📊 Para ver los datos visualmente:');
    console.log('   npx prisma studio\n');
    console.log('🧪 Para probar desde la API (como SUPERADMIN):');
    console.log('   POST http://localhost:3000/api/sunat/test-draft');
    console.log('   POST http://localhost:3000/api/sunat/initialize\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testSunat();
