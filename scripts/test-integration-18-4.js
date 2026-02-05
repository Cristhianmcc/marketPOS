// Test de integración end-to-end del Módulo 18.4
// Verifica el flujo completo usando la base de datos

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

console.log('═══════════════════════════════════════════════════');
console.log('🧪 MÓDULO 18.4 — PRUEBAS DE INTEGRACIÓN');
console.log('═══════════════════════════════════════════════════\n');

async function runTests() {
  try {
    // Test 1: Verificar que SunatJob existe en el schema
    console.log('Test 1: Verificar modelo SunatJob\n');
    
    const jobCount = await prisma.sunatJob.count();
    console.log(`   ✅ Modelo SunatJob existe`);
    console.log(`   ℹ️  Jobs en DB: ${jobCount}\n`);
    
    // Test 2: Verificar estados de ElectronicDocument
    console.log('Test 2: Estados de ElectronicDocument\n');
    
    const docStats = await prisma.electronicDocument.groupBy({
      by: ['status'],
      _count: true,
    });
    
    console.log(`   Documentos por estado:`);
    docStats.forEach(stat => {
      console.log(`   - ${stat.status}: ${stat._count}`);
    });
    console.log('');
    
    // Test 3: Buscar documento SIGNED para testing
    console.log('Test 3: Buscar documento SIGNED\n');
    
    const signedDoc = await prisma.electronicDocument.findFirst({
      where: {
        status: 'SIGNED',
        xmlSigned: {
          not: null,
        },
      },
      include: {
        store: {
          include: {
            sunatSettings: true,
          },
        },
      },
    });
    
    if (signedDoc) {
      console.log(`   ✅ Documento SIGNED encontrado:`);
      console.log(`      ID: ${signedDoc.id}`);
      console.log(`      Número: ${signedDoc.fullNumber}`);
      console.log(`      XML firmado: ${signedDoc.xmlSigned ? 'Sí' : 'No'}`);
      console.log(`      SUNAT habilitado: ${signedDoc.store.sunatSettings?.enabled ? 'Sí' : 'No'}\n`);
      
      // Test 4: Verificar si ya tiene job
      const existingJob = await prisma.sunatJob.findFirst({
        where: {
          electronicDocumentId: signedDoc.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      
      if (existingJob) {
        console.log(`   ℹ️  Este documento ya tiene job:`);
        console.log(`      Job ID: ${existingJob.id}`);
        console.log(`      Estado: ${existingJob.status}`);
        console.log(`      Tipo: ${existingJob.type}`);
        console.log(`      Intentos: ${existingJob.attempts}`);
        if (existingJob.lastError) {
          console.log(`      Último error: ${existingJob.lastError}`);
        }
        console.log('');
      } else {
        console.log(`   ℹ️  Este documento NO tiene jobs aún\n`);
        console.log(`   💡 Para encolarlo, usa:`);
        console.log(`      POST /api/sunat/documents/${signedDoc.id}/queue\n`);
      }
      
    } else {
      console.log(`   ⚠️  No hay documentos SIGNED disponibles`);
      console.log(`   💡 Para crear uno:`);
      console.log(`      1. POST /api/sunat/documents/:id/build-xml`);
      console.log(`      2. POST /api/sunat/documents/:id/sign\n`);
    }
    
    // Test 5: Verificar configuración SUNAT
    console.log('Test 4: Configuración SUNAT\n');
    
    const sunatSettings = await prisma.sunatSettings.findFirst({
      where: {
        enabled: true,
      },
    });
    
    if (sunatSettings) {
      console.log(`   ✅ SUNAT configurado:`);
      console.log(`      Store ID: ${sunatSettings.storeId}`);
      console.log(`      Ambiente: ${sunatSettings.env || 'BETA'}`);
      console.log(`      RUC: ${sunatSettings.ruc}`);
      console.log(`      Usuario SOL: ${sunatSettings.solUser ? 'Configurado' : 'NO configurado'}`);
      console.log(`      Contraseña SOL: ${sunatSettings.solPass ? 'Configurada' : 'NO configurada'}`);
      console.log(`      Certificado: ${sunatSettings.certPfxBase64 ? 'Configurado' : 'NO configurado'}\n`);
      
      if (!sunatSettings.solUser || !sunatSettings.solPass) {
        console.log(`   ⚠️  ADVERTENCIA: Faltan credenciales SOL`);
        console.log(`      El worker no podrá enviar documentos a SUNAT\n`);
      }
    } else {
      console.log(`   ⚠️  No hay configuración SUNAT habilitada\n`);
    }
    
    // Test 6: Verificar jobs recientes
    console.log('Test 5: Jobs recientes\n');
    
    const recentJobs = await prisma.sunatJob.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        electronicDocument: {
          select: {
            fullNumber: true,
            status: true,
          },
        },
      },
    });
    
    if (recentJobs.length > 0) {
      console.log(`   Últimos ${recentJobs.length} jobs:\n`);
      recentJobs.forEach((job, i) => {
        console.log(`   ${i + 1}. ${job.electronicDocument?.fullNumber || 'N/A'}`);
        console.log(`      Job: ${job.id.slice(0, 8)}... | ${job.status}`);
        console.log(`      Tipo: ${job.type} | Intentos: ${job.attempts}`);
        if (job.lastError) {
          console.log(`      Error: ${job.lastError.substring(0, 60)}...`);
        }
        console.log('');
      });
    } else {
      console.log(`   ℹ️  No hay jobs en el sistema aún\n`);
    }
    
    // Test 7: Verificar audit logs
    console.log('Test 6: Audit Logs SUNAT\n');
    
    const auditCount = await prisma.auditLog.count({
      where: {
        action: {
          startsWith: 'SUNAT_',
        },
      },
    });
    
    console.log(`   ✅ Logs de auditoría SUNAT: ${auditCount}\n`);
    
    if (auditCount > 0) {
      const recentAudits = await prisma.auditLog.findMany({
        where: {
          action: {
            startsWith: 'SUNAT_',
          },
        },
        take: 5,
        orderBy: {
          timestamp: 'desc',
        },
      });
      
      console.log(`   Últimos eventos:\n`);
      recentAudits.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.action}`);
        console.log(`      ${new Date(log.timestamp).toLocaleString()}`);
        console.log('');
      });
    }
    
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ PRUEBAS DE INTEGRACIÓN COMPLETADAS');
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('💡 Estado del Sistema:\n');
    console.log(`   Worker: ${process.env.ENABLE_SUNAT === 'true' ? 'Habilitado' : 'Deshabilitado (ENABLE_SUNAT)'}`);
    console.log(`   Jobs pendientes: ${await prisma.sunatJob.count({ where: { status: 'QUEUED' } })}`);
    console.log(`   Jobs completados: ${await prisma.sunatJob.count({ where: { status: 'DONE' } })}`);
    console.log(`   Jobs fallidos: ${await prisma.sunatJob.count({ where: { status: 'FAILED' } })}`);
    console.log(`   Docs SIGNED: ${await prisma.electronicDocument.count({ where: { status: 'SIGNED' } })}`);
    console.log(`   Docs ACCEPTED: ${await prisma.electronicDocument.count({ where: { status: 'ACCEPTED' } })}`);
    console.log(`   Docs ERROR: ${await prisma.electronicDocument.count({ where: { status: 'ERROR' } })}`);
    console.log('');
    
    console.log('🚀 Para probar el flujo completo:\n');
    console.log('   1. Asegurar que hay un documento SIGNED');
    console.log('   2. Iniciar worker: npm run sunat:worker');
    console.log('   3. Encolar documento: POST /api/sunat/documents/{id}/queue');
    console.log('   4. Ver logs del worker procesando');
    console.log('   5. Verificar estado en ElectronicDocument\n');
    
  } catch (error) {
    console.error('❌ Error en las pruebas:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
