/**
 * Script de prueba para Módulo 18.7 - SUNAT PROD Hardening
 * 
 * Ejecutar: node scripts/test-sunat-module-18-7.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testEndpoint(name, method, path, body = null) {
  console.log(`\n🧪 ${name}`);
  console.log(`   ${method} ${path}`);
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const res = await fetch(`${BASE_URL}${path}`, options);
    const data = await res.json();
    
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2).substring(0, 500));
    
    return { status: res.status, data };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { error: error.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MÓDULO 18.7 - SUNAT PROD HARDENING TESTS');
  console.log('='.repeat(60));

  // Test 1: Estado del entorno (sin auth, debe dar 401)
  await testEndpoint(
    'GET /api/sunat/settings/environment (sin auth)',
    'GET',
    '/api/sunat/settings/environment'
  );

  // Test 2: Estado de configuración
  await testEndpoint(
    'GET /api/sunat/settings/status',
    'GET',
    '/api/sunat/settings/status'
  );

  // Test 3: Admin requeue (sin auth)
  await testEndpoint(
    'GET /api/sunat/admin/requeue (sin auth)',
    'GET',
    '/api/sunat/admin/requeue'
  );

  // Test 4: Emit con FACTURA y RUC inválido
  await testEndpoint(
    'POST /api/sunat/emit - FACTURA con RUC inválido',
    'POST',
    '/api/sunat/emit',
    {
      saleId: 'test-sale-123',
      docType: 'FACTURA',
      customerDocType: 'RUC',
      customerDocNumber: '123', // Inválido
      customerName: 'Test Company'
    }
  );

  // Test 5: Emit con FACTURA usando DNI (debe fallar)
  await testEndpoint(
    'POST /api/sunat/emit - FACTURA con DNI (debe rechazar)',
    'POST',
    '/api/sunat/emit',
    {
      saleId: 'test-sale-123',
      docType: 'FACTURA',
      customerDocType: 'DNI',
      customerDocNumber: '12345678',
      customerName: 'Juan Perez'
    }
  );

  // Test 6: Cambiar a PROD sin confirmación
  await testEndpoint(
    'POST /api/sunat/settings/environment - PROD sin confirmación',
    'POST',
    '/api/sunat/settings/environment',
    {
      env: 'PROD'
      // Sin confirmText - debe fallar
    }
  );

  console.log('\n' + '='.repeat(60));
  console.log('TESTS COMPLETADOS');
  console.log('='.repeat(60));
  console.log('\n⚠️  Nota: Los tests sin autenticación darán 401.');
  console.log('    Para tests completos, usar sesión autenticada.\n');
}

runTests().catch(console.error);
