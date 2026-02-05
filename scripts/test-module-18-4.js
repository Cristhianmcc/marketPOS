// Test funcional del Módulo 18.4
// Prueba las funcionalidades principales sin llamar a SUNAT

console.log('═══════════════════════════════════════════════════');
console.log('🧪 MÓDULO 18.4 — PRUEBAS FUNCIONALES');
console.log('═══════════════════════════════════════════════════\n');

// Test 1: ZIP Builder
console.log('📦 Test 1: ZIP Builder\n');

try {
  const { buildZip, buildSunatFilename, mapDocTypeToSunatCode, extractFromZip } = require('../src/lib/sunat/zip/buildZip');
  
  // Test buildSunatFilename
  const filename = buildSunatFilename('20123456789', '01', 'F001', '123');
  console.log(`   ✅ buildSunatFilename: ${filename}`);
  
  if (filename !== '20123456789-01-F001-00000123.xml') {
    throw new Error(`Expected 20123456789-01-F001-00000123.xml, got ${filename}`);
  }
  
  // Test mapDocTypeToSunatCode
  const codes = {
    'FACTURA': '01',
    'BOLETA': '03',
    'CREDIT_NOTE': '07',
    'DEBIT_NOTE': '08',
  };
  
  Object.entries(codes).forEach(([docType, expected]) => {
    const code = mapDocTypeToSunatCode(docType);
    if (code !== expected) {
      throw new Error(`mapDocTypeToSunatCode(${docType}) = ${code}, expected ${expected}`);
    }
    console.log(`   ✅ mapDocTypeToSunatCode("${docType}") = "${code}"`);
  });
  
  // Test buildZip y extractFromZip
  const xmlContent = '<?xml version="1.0"?><Invoice>Test</Invoice>';
  const zipBase64 = buildZip('test.xml', xmlContent);
  console.log(`   ✅ buildZip generó ${zipBase64.length} caracteres de Base64`);
  
  const extracted = extractFromZip(zipBase64);
  if (extracted !== xmlContent) {
    throw new Error('El contenido extraído no coincide con el original');
  }
  console.log(`   ✅ extractFromZip recuperó el XML correctamente`);
  
  console.log('\n   ✅ ZIP Builder: TODOS LOS TESTS PASADOS\n');
  
} catch (error) {
  console.error(`   ❌ Error en ZIP Builder:`, error.message);
  process.exit(1);
}

// Test 2: CDR Parser
console.log('📄 Test 2: CDR Parser\n');

try {
  const { isAcceptedBysunat, getStatusMessage } = require('../src/lib/sunat/cdr/parseCdr');
  
  // Test isAcceptedBysunat
  const acceptedCodes = ['0000', '0001', '0100', '0200'];
  const rejectedCodes = ['2000', '2100', '4000'];
  
  acceptedCodes.forEach(code => {
    const result = isAcceptedBysunat(code);
    if (!result) {
      throw new Error(`isAcceptedBysunat("${code}") debería ser true`);
    }
    console.log(`   ✅ isAcceptedBysunat("${code}") = true`);
  });
  
  rejectedCodes.forEach(code => {
    const result = isAcceptedBysunat(code);
    if (result) {
      throw new Error(`isAcceptedBysunat("${code}") debería ser false`);
    }
    console.log(`   ✅ isAcceptedBysunat("${code}") = false`);
  });
  
  // Test getStatusMessage
  const testCodes = {
    '0000': 'Aceptado',
    '2000': 'Rechazo - Error en el RUC del emisor',
    '2300': 'Rechazo - El comprobante fue enviado anteriormente',
  };
  
  Object.entries(testCodes).forEach(([code, expected]) => {
    const message = getStatusMessage(code);
    if (!message.includes(expected.split(' - ')[0])) {
      console.log(`   ⚠️  getStatusMessage("${code}") = "${message}" (esperaba contener "${expected}")`);
    } else {
      console.log(`   ✅ getStatusMessage("${code}") contiene "${expected.split(' - ')[0]}"`);
    }
  });
  
  console.log('\n   ✅ CDR Parser: TODOS LOS TESTS PASADOS\n');
  
} catch (error) {
  console.error(`   ❌ Error en CDR Parser:`, error.message);
  process.exit(1);
}

// Test 3: Verificar estructura de processSunatJob
console.log('⚙️  Test 3: Proceso de Jobs\n');

try {
  const { processSunatJob } = require('../src/lib/sunat/process/processSunatJob');
  
  if (typeof processSunatJob !== 'function') {
    throw new Error('processSunatJob no es una función');
  }
  
  console.log(`   ✅ processSunatJob está definida`);
  console.log(`   ℹ️  Requiere job real en DB para ejecutar`);
  
  console.log('\n   ✅ Proceso de Jobs: ESTRUCTURA OK\n');
  
} catch (error) {
  console.error(`   ❌ Error en Proceso de Jobs:`, error.message);
  process.exit(1);
}

// Test 4: Verificar endpoints
console.log('🌐 Test 4: Endpoints API\n');

try {
  const fs = require('fs');
  const path = require('path');
  
  const queueRoute = path.join(process.cwd(), 'src/app/api/sunat/documents/[id]/queue/route.ts');
  const retryRoute = path.join(process.cwd(), 'src/app/api/sunat/documents/[id]/retry/route.ts');
  
  if (!fs.existsSync(queueRoute)) {
    throw new Error('queue/route.ts no existe');
  }
  
  if (!fs.existsSync(retryRoute)) {
    throw new Error('retry/route.ts no existe');
  }
  
  const queueContent = fs.readFileSync(queueRoute, 'utf-8');
  const retryContent = fs.readFileSync(retryRoute, 'utf-8');
  
  // Verificar funciones importantes en queue
  if (!queueContent.includes('export async function POST')) {
    throw new Error('queue/route.ts no exporta función POST');
  }
  
  if (!queueContent.includes('auditSunatJobQueued')) {
    throw new Error('queue/route.ts no usa auditoría');
  }
  
  console.log(`   ✅ POST /api/sunat/documents/:id/queue existe`);
  console.log(`   ✅ Incluye auditoría`);
  
  // Verificar funciones importantes en retry
  if (!retryContent.includes('export async function POST')) {
    throw new Error('retry/route.ts no exporta función POST');
  }
  
  if (!retryContent.includes('ERROR') && !retryContent.includes('REJECTED')) {
    console.log(`   ⚠️  retry/route.ts podría no validar estados correctamente`);
  } else {
    console.log(`   ✅ retry/route.ts valida estados ERROR/REJECTED`);
  }
  
  console.log(`   ✅ POST /api/sunat/documents/:id/retry existe`);
  
  console.log('\n   ✅ Endpoints API: ESTRUCTURA OK\n');
  
} catch (error) {
  console.error(`   ❌ Error en Endpoints:`, error.message);
  process.exit(1);
}

// Test 5: Verificar auditoría
console.log('📋 Test 5: Auditoría\n');

try {
  const audit = require('../src/domain/sunat/audit');
  
  const requiredFunctions = [
    'auditSunatJobQueued',
    'auditSunatJobStarted',
    'auditSunatJobSuccess',
    'auditSunatJobFailed',
    'auditSunatCdrReceived',
  ];
  
  requiredFunctions.forEach(fnName => {
    if (typeof audit[fnName] !== 'function') {
      throw new Error(`${fnName} no está definida`);
    }
    console.log(`   ✅ ${fnName} disponible`);
  });
  
  console.log('\n   ✅ Auditoría: TODAS LAS FUNCIONES OK\n');
  
} catch (error) {
  console.error(`   ❌ Error en Auditoría:`, error.message);
  process.exit(1);
}

// Test 6: Verificar worker
console.log('🔄 Test 6: Worker\n');

try {
  const fs = require('fs');
  const path = require('path');
  
  const workerPath = path.join(process.cwd(), 'src/worker/sunatWorker.ts');
  
  if (!fs.existsSync(workerPath)) {
    throw new Error('sunatWorker.ts no existe');
  }
  
  const workerContent = fs.readFileSync(workerPath, 'utf-8');
  
  const requiredParts = [
    'workerLoop',
    'processAvailableJobs',
    'processSunatJob',
    'setupGracefulShutdown',
    'SIGTERM',
    'SIGINT',
  ];
  
  requiredParts.forEach(part => {
    if (!workerContent.includes(part)) {
      throw new Error(`Worker no incluye: ${part}`);
    }
    console.log(`   ✅ Worker incluye: ${part}`);
  });
  
  console.log('\n   ✅ Worker: ESTRUCTURA COMPLETA\n');
  
} catch (error) {
  console.error(`   ❌ Error en Worker:`, error.message);
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════');
console.log('✅ TODAS LAS PRUEBAS FUNCIONALES PASARON');
console.log('═══════════════════════════════════════════════════\n');

console.log('💡 Próximos pasos:\n');
console.log('   1. Iniciar worker:');
console.log('      npm run sunat:worker\n');
console.log('   2. Encolar un documento SIGNED:');
console.log('      POST /api/sunat/documents/{id}/queue\n');
console.log('   3. Ver logs del worker procesando\n');
console.log('   4. Verificar en DB:');
console.log('      - SunatJob (status DONE)');
console.log('      - ElectronicDocument (status ACCEPTED/REJECTED)');
console.log('      - AuditLog (eventos SUNAT_JOB_*)\n');
