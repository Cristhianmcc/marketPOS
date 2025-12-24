/**
 * Script completo de pruebas de checkout
 * Ejecutar: node scripts/test-checkout-complete.js
 */

const BASE_URL = 'http://localhost:3000';

// Colores
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(msg, color = 'reset') {
  console.log(`${c[color]}${msg}${c.reset}`);
}

// Login y obtener cookie
async function login() {
  log('\n🔐 Iniciando sesión...', 'cyan');
  
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@bodega.com',
      password: 'password123',
    }),
  });

  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) {
    log('❌ No se pudo obtener sesión', 'red');
    return null;
  }

  const cookie = setCookie.split(';')[0];
  log('✅ Sesión obtenida', 'green');
  return cookie;
}

// Obtener productos
async function getProducts(cookie) {
  const response = await fetch(`${BASE_URL}/api/inventory?active=true&limit=10`, {
    headers: { Cookie: cookie },
  });

  const data = await response.json();
  return data.products || [];
}

// Test genérico
async function testCheckout(cookie, testName, payload, expectedStatus) {
  log(`\n🧪 ${testName}`, 'yellow');

  try {
    const response = await fetch(`${BASE_URL}/api/sales/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const pass = response.status === expectedStatus;

    log(`   Status: ${response.status} ${pass ? '✅' : `❌ (esperado: ${expectedStatus})`}`, pass ? 'green' : 'red');
    log(`   Code: ${data.code || 'N/A'}`, 'cyan');
    log(`   Message: ${data.message || 'N/A'}`, 'cyan');
    
    if (data.details) {
      log(`   Details: ${JSON.stringify(data.details)}`, 'cyan');
    }

    // CRÍTICO: verificar que NO sea 500 en errores de validación
    if (response.status === 500 && expectedStatus !== 500) {
      log('   🚨 CRÍTICO: Devolvió 500 cuando NO debería', 'red');
      return false;
    }

    return pass;
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
    return false;
  }
}

// CHECK 1: Errores NO devuelven 500
async function check1(cookie, products) {
  log('\n' + '='.repeat(70), 'magenta');
  log('CHECK 1: EL 500 SOLO SALE EN ERRORES DESCONOCIDOS', 'magenta');
  log('='.repeat(70), 'magenta');

  const results = [];

  // 1.1 Carrito vacío
  results.push(await testCheckout(
    cookie,
    'Test 1.1: Carrito vacío → debe devolver 400',
    { items: [] },
    400
  ));

  // 1.2 Producto inexistente
  results.push(await testCheckout(
    cookie,
    'Test 1.2: Producto inexistente → debe devolver 400',
    { items: [{ storeProductId: 'producto-falso-xxx', quantity: 1, unitPrice: 10 }] },
    400
  ));

  // 1.3 Formato inválido
  results.push(await testCheckout(
    cookie,
    'Test 1.3: Formato inválido (sin storeProductId) → debe devolver 400',
    { items: [{ quantity: 1, unitPrice: 10 }] },
    400
  ));

  // 1.4 Cantidad negativa
  if (products.length > 0) {
    results.push(await testCheckout(
      cookie,
      'Test 1.4: Cantidad negativa → debe devolver 400',
      { items: [{ storeProductId: products[0].id, quantity: -5, unitPrice: 10 }] },
      400
    ));
  }

  // 1.5 Cantidad decimal en UNIT
  const unitProduct = products.find(p => p.product.unitType === 'UNIT');
  if (unitProduct) {
    results.push(await testCheckout(
      cookie,
      'Test 1.5: Cantidad decimal en UNIT → debe devolver 400',
      { items: [{ storeProductId: unitProduct.id, quantity: 1.5, unitPrice: unitProduct.price }] },
      400
    ));
  }

  // 1.6 Stock insuficiente
  const productWithStock = products.find(p => p.stock !== null && p.stock > 0 && p.stock < 100);
  if (productWithStock) {
    results.push(await testCheckout(
      cookie,
      'Test 1.6: Stock insuficiente → debe devolver 409',
      { items: [{ storeProductId: productWithStock.id, quantity: 9999, unitPrice: productWithStock.price }] },
      409
    ));
  }

  const passed = results.filter(Boolean).length;
  const total = results.length;

  log(`\n📊 Resultado CHECK 1: ${passed}/${total} tests pasaron`, passed === total ? 'green' : 'yellow');
  return passed === total;
}

// CHECK 2: Ventas concurrentes
async function check2(cookie, products) {
  log('\n' + '='.repeat(70), 'magenta');
  log('CHECK 2: RETRY DE SALENUMBER EN CONCURRENCIA', 'magenta');
  log('='.repeat(70), 'magenta');

  if (products.length === 0) {
    log('❌ No hay productos disponibles', 'red');
    return false;
  }

  // Buscar producto con stock disponible (null o > 2)
  const product = products.find(p => p.stock === null || (p.stock !== null && p.stock > 2));
  if (!product) {
    log('❌ No hay productos con stock suficiente', 'red');
    log('   Tip: Agrega stock a algún producto desde /inventory', 'yellow');
    return false;
  }

  log(`\n🚀 Lanzando 2 ventas concurrentes con: ${product.product.name} (Stock: ${product.stock})`, 'cyan');

  const payload = {
    items: [{
      storeProductId: product.id,
      quantity: 1,
      unitPrice: product.price,
    }],
  };

  // Lanzar 2 requests simultáneos
  const promises = [
    fetch(`${BASE_URL}/api/sales/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
    }),
    fetch(`${BASE_URL}/api/sales/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
    }),
  ];

  const responses = await Promise.all(promises);
  const dataArray = await Promise.all(responses.map(r => r.json()));

  log('\n📋 Resultados:', 'cyan');

  let allSuccess = true;
  const saleNumbers = new Set();

  for (let i = 0; i < responses.length; i++) {
    const status = responses[i].status;
    const data = dataArray[i];

    log(`\n   Venta ${i + 1}:`, 'cyan');
    log(`      Status: ${status} ${status === 201 ? '✅' : '❌'}`, status === 201 ? 'green' : 'red');

    if (data.saleNumber) {
      log(`      Sale #: ${data.saleNumber}`, 'green');
      log(`      Total: S/ ${data.total}`, 'green');
      saleNumbers.add(data.saleNumber);
    } else if (data.code) {
      log(`      Error: ${data.code} - ${data.message}`, 'red');
      allSuccess = false;
    }
  }

  const uniqueSales = saleNumbers.size === 2;

  log('\n📊 Resultado CHECK 2:', 'cyan');
  log(`   Ambas ventas exitosas: ${allSuccess ? '✅' : '❌'}`, allSuccess ? 'green' : 'red');
  log(`   Sale numbers únicos: ${uniqueSales ? '✅' : '❌'}`, uniqueSales ? 'green' : 'red');
  log(`   Numbers: [${Array.from(saleNumbers).join(', ')}]`, 'cyan');

  return allSuccess && uniqueSales;
}

// CHECK 3: Venta exitosa normal
async function check3(cookie, products) {
  log('\n' + '='.repeat(70), 'magenta');
  log('CHECK 3: VENTA EXITOSA', 'magenta');
  log('='.repeat(70), 'magenta');

  if (products.length === 0) {
    log('❌ No hay productos disponibles', 'red');
    return false;
  }

  // Buscar producto con stock disponible
  const product = products.find(p => p.stock === null || (p.stock !== null && p.stock > 0));
  if (!product) {
    log('❌ No hay productos con stock', 'red');
    log('   Tip: Agrega stock a algún producto desde /inventory', 'yellow');
    return false;
  }

  const result = await testCheckout(
    cookie,
    `Test: Venta exitosa con ${product.product.name} (Stock: ${product.stock}) → debe devolver 201`,
    {
      items: [{
        storeProductId: product.id,
        quantity: 1,
        unitPrice: product.price,
      }],
    },
    201
  );

  log(`\n📊 Resultado CHECK 3: ${result ? '✅ PASS' : '❌ FAIL'}`, result ? 'green' : 'red');
  return result;
}

// MAIN
async function main() {
  log('\n' + '█'.repeat(70), 'cyan');
  log('🔥 VERIFICACIÓN COMPLETA DE CHECKOUT', 'cyan');
  log('█'.repeat(70), 'cyan');

  // Login
  const cookie = await login();
  if (!cookie) {
    log('\n❌ No se pudo obtener sesión. Abortando.', 'red');
    process.exit(1);
  }

  // Obtener productos
  log('\n📦 Obteniendo productos...', 'cyan');
  const products = await getProducts(cookie);
  log(`✅ ${products.length} productos disponibles`, 'green');

  if (products.length > 0) {
    log(`   Ejemplo: ${products[0].product.name} (Stock: ${products[0].stock})`, 'cyan');
  }

  // Ejecutar checks
  const check1Result = await check1(cookie, products);
  const check2Result = await check2(cookie, products);
  const check3Result = await check3(cookie, products);

  // Resumen final
  log('\n' + '█'.repeat(70), 'magenta');
  log('📊 RESUMEN FINAL', 'magenta');
  log('█'.repeat(70), 'magenta');

  log(`\n   CHECK 1 (Manejo de errores):    ${check1Result ? '✅ PASS' : '❌ FAIL'}`, check1Result ? 'green' : 'red');
  log(`   CHECK 2 (Retry saleNumber):     ${check2Result ? '✅ PASS' : '❌ FAIL'}`, check2Result ? 'green' : 'red');
  log(`   CHECK 3 (Venta exitosa):        ${check3Result ? '✅ PASS' : '❌ FAIL'}`, check3Result ? 'green' : 'red');

  const allPassed = check1Result && check2Result && check3Result;

  if (allPassed) {
    log('\n🎉 TODOS LOS CHECKS PASARON - SISTEMA ROBUSTO ✅', 'green');
  } else {
    log('\n⚠️  ALGUNOS CHECKS FALLARON - REVISAR', 'yellow');
  }

  log('\n' + '█'.repeat(70) + '\n', 'cyan');
}

main().catch(console.error);
