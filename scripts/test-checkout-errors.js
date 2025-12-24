/**
 * Script de prueba para verificar manejo de errores en /api/sales/checkout
 * 
 * Uso:
 * 1. Asegúrate de que el servidor esté corriendo (npm run dev)
 * 2. Inicia sesión en http://localhost:3000/login
 * 3. Copia la cookie de sesión desde DevTools → Application → Cookies
 * 4. Ejecuta: node scripts/test-checkout-errors.js <session-cookie>
 */

const BASE_URL = 'http://localhost:3000';

async function testCheckout(sessionCookie, testName, payload, expectedStatus) {
  console.log(`\n🧪 Test: ${testName}`);
  console.log('   Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch(`${BASE_URL}/api/sales/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const statusMatch = response.status === expectedStatus;

    console.log(`   Status: ${response.status} ${statusMatch ? '✅' : '❌ (esperado: ' + expectedStatus + ')'}`);
    console.log('   Response:', JSON.stringify(data, null, 2));

    if (!statusMatch) {
      console.log('   ⚠️  STATUS INCORRECTO');
    }

    // Verificar que no sea 500 en errores de validación
    if (response.status === 500 && expectedStatus !== 500) {
      console.log('   🚨 ERROR: Devolvió 500 cuando NO debería');
      return false;
    }

    return statusMatch;
  } catch (error) {
    console.log('   ❌ Error de conexión:', error.message);
    return false;
  }
}

async function runTests(sessionCookie) {
  console.log('='.repeat(60));
  console.log('🔥 VERIFICACIÓN DE MANEJO DE ERRORES - CHECKOUT');
  console.log('='.repeat(60));

  const results = [];

  // Test 1: Producto inexistente
  results.push(
    await testCheckout(
      sessionCookie,
      'Producto inexistente (debe devolver 400)',
      {
        items: [
          {
            storeProductId: 'producto-falso-xxx-999',
            quantity: 1,
            unitPrice: 10,
          },
        ],
      },
      400
    )
  );

  // Test 2: Carrito vacío
  results.push(
    await testCheckout(
      sessionCookie,
      'Carrito vacío (debe devolver 400)',
      {
        items: [],
      },
      400
    )
  );

  // Test 3: Cantidad negativa
  results.push(
    await testCheckout(
      sessionCookie,
      'Cantidad negativa (debe devolver 400)',
      {
        items: [
          {
            storeProductId: 'cualquier-id',
            quantity: -5,
            unitPrice: 10,
          },
        ],
      },
      400
    )
  );

  // Test 4: Formato inválido (sin storeProductId)
  results.push(
    await testCheckout(
      sessionCookie,
      'Formato inválido - sin storeProductId (debe devolver 400)',
      {
        items: [
          {
            quantity: 1,
            unitPrice: 10,
          },
        ],
      },
      400
    )
  );

  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN');
  console.log('='.repeat(60));
  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log(`✅ Pasaron: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 TODOS LOS TESTS PASARON');
    console.log('✅ El servidor maneja correctamente los errores de validación');
    console.log('✅ No devuelve 500 en errores esperados');
  } else {
    console.log('\n⚠️  ALGUNOS TESTS FALLARON');
    console.log('Revisa los resultados arriba para ver qué salió mal');
  }
}

// Verificar argumentos
const sessionCookie = process.argv[2];

if (!sessionCookie) {
  console.log('❌ Error: Falta la cookie de sesión\n');
  console.log('Uso:');
  console.log('  node scripts/test-checkout-errors.js "<session-cookie>"');
  console.log('\nPasos:');
  console.log('  1. Inicia sesión en http://localhost:3000/login');
  console.log('  2. Abre DevTools → Application → Cookies');
  console.log('  3. Copia el valor completo de la cookie (ej: session=...)');
  console.log('  4. Ejecuta este script con ese valor\n');
  process.exit(1);
}

runTests(sessionCookie);
