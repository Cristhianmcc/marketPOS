// Script para verificar el estado del módulo SUNAT
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSunat() {
  try {
    console.log('🧪 VERIFICACIÓN DEL MÓDULO SUNAT\n');
    console.log('═══════════════════════════════════════════════\n');

    // 1. Verificar feature flag
    console.log('1️⃣  Feature Flag ENABLE_SUNAT');
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
    console.log(`   Estado: ${flag?.enabled ? '✅ ACTIVO' : '❌ INACTIVO'}\n`);

    // 2. Verificar configuración SUNAT
    console.log('2️⃣  Configuración SUNAT (sunat_settings)');
    const sunatSettings = await prisma.sunatSettings.findUnique({
      where: { storeId: store.id }
    });

    if (!sunatSettings) {
      console.log('   ❌ No existe configuración SUNAT\n');
    } else {
      console.log(`   Entorno: ${sunatSettings.env}`);
      console.log(`   Habilitado: ${sunatSettings.enabled ? 'Sí' : 'No'}`);
      console.log(`   RUC: ${sunatSettings.ruc || '(no configurado)'}`);
      console.log(`   Series configuradas:`);
      console.log(`     - Facturas: ${sunatSettings.defaultFacturaSeries} (próximo: ${sunatSettings.nextFacturaNumber})`);
      console.log(`     - Boletas: ${sunatSettings.defaultBoletaSeries} (próximo: ${sunatSettings.nextBoletaNumber})`);
      console.log(`     - Notas Crédito: ${sunatSettings.defaultNcSeries} (próximo: ${sunatSettings.nextNcNumber})`);
      console.log(`     - Notas Débito: ${sunatSettings.defaultNdSeries} (próximo: ${sunatSettings.nextNdNumber})\n`);
    }

    // 3. Listar documentos electrónicos
    console.log('3️⃣  Documentos Electrónicos (electronic_documents)');
    const docs = await prisma.electronicDocument.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (docs.length === 0) {
      console.log('   (No hay documentos creados aún)\n');
    } else {
      console.log(`   Total: ${docs.length} documentos\n`);
      docs.forEach((doc, i) => {
        console.log(`   ${i + 1}. ${doc.fullNumber} - ${doc.docType}`);
        console.log(`      Cliente: ${doc.customerName} (${doc.customerDocType} ${doc.customerDocNumber})`);
        console.log(`      Total: S/ ${doc.total.toFixed(2)}`);
        console.log(`      Estado: ${doc.status}`);
        console.log(`      Fecha: ${doc.createdAt.toLocaleString('es-PE')}\n`);
      });
    }

    // 4. Verificar audit logs SUNAT
    console.log('4️⃣  Logs de Auditoría SUNAT');
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'SUNAT' },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (auditLogs.length === 0) {
      console.log('   (No hay logs de auditoría SUNAT)\n');
    } else {
      console.log(`   Últimos ${auditLogs.length} eventos:\n`);
      auditLogs.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.action} [${log.severity}]`);
        console.log(`      ${log.createdAt.toLocaleString('es-PE')}`);
        if (log.details) {
          console.log(`      ${log.details}\n`);
        }
      });
    }

    // 5. Trabajos SUNAT pendientes
    console.log('5️⃣  Cola de Trabajos SUNAT (sunat_jobs)');
    const jobs = await prisma.sunatJob.findMany({
      where: { 
        storeId: store.id,
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (jobs.length === 0) {
      console.log('   (No hay trabajos pendientes)\n');
    } else {
      console.log(`   ${jobs.length} trabajos pendientes\n`);
      jobs.forEach((job, i) => {
        console.log(`   ${i + 1}. ${job.jobType} - ${job.status}`);
        console.log(`      Creado: ${job.createdAt.toLocaleString('es-PE')}\n`);
      });
    }

    console.log('═══════════════════════════════════════════════');
    console.log('✅ VERIFICACIÓN COMPLETADA\n');
    
    console.log('📋 PRÓXIMOS PASOS:\n');
    console.log('1. Abrir Prisma Studio para explorar visualmente:');
    console.log('   npx prisma studio\n');
    
    console.log('2. Probar creación de documentos (requiere SUPERADMIN):');
    console.log('   POST http://localhost:3000/api/sunat/test-draft');
    console.log('   Body: { "storeId": "...", "docType": "BOLETA", ... }\n');
    
    console.log('3. Configurar RUC y credenciales SUNAT:');
    console.log('   - Actualizar sunat_settings en Prisma Studio');
    console.log('   - Agregar ruc, solUser, solPass, certPfxBase64\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testSunat();
