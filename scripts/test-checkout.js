/**
 * Script completo de pruebas para checkout desde terminal
 * Ejecutar: node scripts/test-checkout.js
 */

const BASE_URL = 'http://localhost:3000';

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Paso 1: Login y obtener sesión
async function login() {
  log('\n🔐 Iniciando sesión...', 'cyan');
  
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@bodega.com',
        password: 'password123',
      }),
    });

    if (!response.ok) {
      log('❌ Error al iniciar sesión', 'red');
      return null;
    }

    // Extraer cookie de sesión
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) {
      log('❌ No se recibió cookie de sesión', 'red');
      return null;
    }

    const sessionCookie = setCookie.split(';')[0];
    log(`✅ Sesión obtenida: ${sessionCookie.substring(0, 30)}...`, 'green');
    return sessionCookie;
  } catch (error) {
    log(`❌ Error de conexión: ${error.message}`, 'red');
    return null;
  }
}

// Obtener productos para pruebas
async function getProducts(sessionCookie) {
  log('\n📦 Obteniendo productos del inventario...', 'cyan');
  
  try {
    const response = await fetch(`${BASE_URL}/api/inventory?active=true&limit=5`, {
      headers: { Cookie: sessionCookie },
    });

    if (!response.ok) {
      log('❌ Error al obtener productos', 'red');
      return [];
    }

    const data = await response.json();
    const products = data.products || [];
    
    log(`✅ ${products.length} productos disponibles`, 'green');
    if (products.length > 0) {
      log(`   Ejemplo: ${products[0].product.name} (${products[0].id})`, 'blue');
    }
    
    return products;
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return [];
  }
}

// Test genérico de checkout
async function testCheckout(sessionCookie, testName, payload, expectedStatus) {
  log(`\n🧪 ${testName}`, 'yellow');
  
  try {
    const response = await fetch(`${BASE_URL}/api/sales/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const statusMatch = response.status === expectedStatus;

    log(`   Status: ${response.status} ${statusMatch ? '✅' : '❌ (esperado: ' + expectedStatus + ')'}`, 
        statusMatch ? 'green' : 'red');
    log(`   Code: ${data.code || 'N/A'}`, 'blue');
    log(`   Message: ${data.message || 'N/A'}`, 'blue');
    
    if (data.details) {
      log(`   Details: ${JSON.stringify(data.details)}`, 'blue');
    }

    // Verificar que NO sea 500 en errores de validación
    if (response.status === 500 && expectedStatus !== 500) {
      log('   🚨 CRÍTICO: Devolvió 500 cuando NO debería', 'red');
      return false;
    }

    return statusMatch;
  } catch (error) {
    log(`   ❌ Error de conexión: ${error.message}`, 'red');
    return false;
  }
}

// CHECK 1: Errores NO devuelven 500
async function check1_ErrorHandling(sessionCookie, products) {
  log('\n' + '='.repeat(70), 'magenta');
  log('CHECK 1: EL 500 SOLO SALE EN ERRORES DESCONOCIDOS', 'magenta');
  log('='.repeat(70), 'magenta');

  const results = [];

  // 1.1 Producto inexistente
  results.push(await testCheckout(
    sessionCookie,
    'Test 1.1: Producto inexistente → debe devolver 400',
    { items: [{ storeProductId: 'producto-falso-xxx', quantity: 1, unitPrice: 10 }] },
    400
  ));

  // 1.2 Carrito vacío
  results.push(await testCheckout(
    sessionCookie,
    'Test 1.2: Carrito vacío → debe devolver 400',
    { items: [] },
    400
  ));

  // 1.3 Cantidad negativa
  results.push(await testCheckout(
    sessionCookie,
    'Test 1.3: Cantidad negativa → debe devolver 400',
    { items: [{ storeProductId: 'cualquier-id', quantity: -5, unitPrice: 10 }] },
    400
  ));

  // 1.4 Cantidad decimal en producto UNIT
  if (products.length > 0) {
    const unitProduct = products.find(p => p.product.unitType === 'UNIT');
    if (unitProduct) {
      results.push(await testCheckout(
        sessionCookie,
        'Test 1.4: Cantidad decimal en UNIT → debe devolver 400',
        { items: [{ storeProductId: unitProduct.id, quantity: 1.5, unitPrice: unitProduct.price }] },
        400
      ));
    }
  }

  // 1.5 Stock insuficiente
  if (products.length > 0) {
    const productWithStock = products.find(p => p.stock !== null && p.stock < 100);
    if (productWithStock) {
      results.push(await testCheckout(
        sessionCookie,
        'Test 1.5: Stock insuficiente → debe devolver 409',
        { items: [{ storeProductId: productWithStock.id, quantity: 9999, unitPrice: productWithStock.price }] },
        409
      ));
    }
  }

  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  log('\n📊 Resultado CHECK 1:', 'cyan');
  log(`   ${passed}/${total} tests pasaron`, passed === total ? 'green' : 'yellow');
  
  return passed === total;
}

// CHECK 2: Retry de saleNumber en concurrencia
async function check2_ConcurrentSales(sessionCookie, products) {
  log('\n' + '='.repeat(70), 'magenta');
  log('CHECK 2: RETRY DE SALENUMBER EN CONCURRENCIA', 'magenta');
  log('='.repeat(70), 'magenta');

  if (products.length === 0) {
    log('❌ No hay productos disponibles para probar', 'red');
    return false;
  }

  const product = products[0];
  const payload = {
    items: [{
      storeProductId: product.id,
      quantity: 1,
      unitPrice: product.price,
    }],
  };

  log('\n🚀 Lanzando 2 ventas concurrentes...', 'cyan');

  // Lanzar 2 requests simultáneos
  const promises = [
    fetch(`${BASE_URL}/api/sales/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify(payload),
    }),
    fetch(`${BASE_URL}/api/sales/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify(payload),
    }),
  ];

  try {
    const responses = await Promise.all(promises);
    const dataArray = await Promise.all(responses.map(r => r.json()));

    log('\n📋 Resultados:', 'cyan');
    
    let allSuccess = true;
    const saleNumbers = new Set();

    for (let i = 0; i < responses.length; i++) {
      const status = responses[i].status;
      const data = dataArray[i];
      
      log(`\n   Venta ${i + 1}:`, 'blue');
      log(`      Status: ${status} ${status === 201 ? '✅' : '❌'}`, status === 201 ? 'green' : 'red');
      
      if (data.saleNumber) {
        log(`      Sale #: ${data.saleNumber}`, 'green');
        saleNumbers.add(data.saleNumber);
      } else if (data.code) {
        log(`      Error: ${data.code} - ${data.message}`, 'red');
        allSuccess = false;
      }
    }

    // Verificar que ambos números sean únicos
    const uniqueSales = saleNumbers.size === 2;
    
    log('\n📊 Resultado CHECK 2:', 'cyan');
    log(`   Ambas ventas: ${allSuccess ? '✅ 201' : '❌ Error'}`, allSuccess ? 'green' : 'red');
    log(`   Sale numbers únicos: ${uniqueSales ? '✅ Sí' : '❌ No'}`, uniqueSales ? 'green' : 'red');
    log(`   Numbers: [${Array.from(saleNumbers).join(', ')}]`, 'blue');

    return allSuccess && uniqueSales;
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return false;
  }
}

// CHECK 3: Venta exitosa
async function check3_SuccessfulCheckout(sessionCookie, products) {
  log('\n' + '='.repeat(70), 'magenta');
  log('CHECK 3: VENTA EXITOSA', 'magenta');
  log('='.repeat(70), 'magenta');

  if (products.length === 0) {
    log('❌ No hay productos disponibles', 'red');
    return false;
  }

  const product = products[0];
  const result = await testCheckout(
    sessionCookie,
    'Test: Venta exitosa → debe devolver 201',
    {
      items: [{
        storeProductId: product.id,
        quantity: 1,
        unitPrice: product.price,
      }],
    },
    201
  );

  log('\n📊 Resultado CHECK 3:', 'cyan');
  log(`   ${result ? '✅ Venta exitosa' : '❌ Fallo'}`, result ? 'green' : 'red');

  return result;
}

// Main
async function runAllChecks() {
  log('\n' + '█'.repeat(70), 'cyan');
  log('🔥 VERIFICACIÓN COMPLETA DE CHECKOUT', 'cyan');
  log('█'.repeat(70) + '\n', 'cyan');

  // Login
  const sessionCookie = await login();
  if (!sessionCookie) {
    log('\n❌ No se pudo obtener sesión. Abortando.', 'red');
    process.exit(1);
  }

  // Obtener productos
  const products = await getProducts(sessionCookie);

  // Ejecutar checks
  const check1 = await check1_ErrorHandling(sessionCookie, products);
  const check2 = await check2_ConcurrentSales(sessionCookie, products);
  const check3 = await check3_SuccessfulCheckout(sessionCookie, products);

  // Resumen final
  log('\n' + '█'.repeat(70), 'magenta');
  log('📊 RESUMEN FINAL', 'magenta');
  log('█'.repeat(70), 'magenta');
  
  log(`\n   CHECK 1 (Manejo de errores):    ${check1 ? '✅ PASS' : '❌ FAIL'}`, check1 ? 'green' : 'red');
  log(`   CHECK 2 (Retry saleNumber):     ${check2 ? '✅ PASS' : '❌ FAIL'}`, check2 ? 'green' : 'red');
  log(`   CHECK 3 (Venta exitosa):        ${check3 ? '✅ PASS' : '❌ FAIL'}`, check3 ? 'green' : 'red');

  const allPassed = check1 && check2 && check3;
  
  if (allPassed) {
    log('\n🎉 TODOS LOS CHECKS PASARON - SISTEMA ROBUSTO ✅', 'green');
  } else {
    log('\n⚠️  ALGUNOS CHECKS FALLARON - REVISAR', 'yellow');
  }

  log('\n' + '█'.repeat(70) + '\n', 'cyan');
}

runAllChecks();
