/**
 * STABILITY TEST COMPLETE - Full E2E Testing
 * MÓDULO 15 - FASE 5
 * 
 * Automatiza tests críticos usando APIs REST
 * REQUISITO: Servidor corriendo en http://localhost:3000
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const results = { passed: 0, failed: 0, skipped: 0 };
let sessionCookie = null;
let testSaleId = null;
let testShiftId = null;

function test(name, passed, details = '') {
  const status = passed ? '✅' : '❌';
  const color = passed ? 'green' : 'red';
  log(`  ${status} ${name}`, color);
  if (details) log(`     ${details}`, 'cyan');
  if (passed) results.passed++;
  else results.failed++;
}

function skip(name, reason = '') {
  log(`  ⏭️  ${name}`, 'yellow');
  if (reason) log(`     ${reason}`, 'cyan');
  results.skipped++;
}

// =============================================================================
// SETUP
// =============================================================================
async function setup() {
  log('\n📦 Setup y autenticación...', 'cyan');
  
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@bodega.com',
        password: 'password123'
      })
    });
    
    if (res.ok) {
      sessionCookie = res.headers.get('set-cookie')?.split(';')[0];
      log('✅ Login exitoso\n', 'green');
      return true;
    }
    return false;
  } catch (error) {
    log(`❌ Setup failed: ${error.message}\n`, 'red');
    return false;
  }
}

// =============================================================================
// SECTION 1: APIs BÁSICAS
// =============================================================================
async function testBasicAPIs() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('1️⃣  APIs BÁSICAS', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  // Test: Get current user
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Cookie': sessionCookie }
    });
    if (res.ok) {
      const user = await res.json();
      test('1.1 - Get current user', user && user.email, `${user.email || 'N/A'} (${user.role || 'N/A'})`);
    } else {
      test('1.1 - Get current user', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('1.1 - Get current user', false, error.message);
  }

  // Test: Get current shift
  try {
    const res = await fetch(`${BASE_URL}/api/shifts/current`, {
      headers: { 'Cookie': sessionCookie }
    });
    const data = await res.json();
    if (data.shift) {
      testShiftId = data.shift.id;
      test('1.2 - Get current shift', true, `Shift ID: ${data.shift.id}`);
    } else {
      skip('1.2 - Get current shift', 'No hay turno abierto - crear manualmente');
    }
  } catch (error) {
    test('1.2 - Get current shift', false, error.message);
  }

  // Test: List sales
  try {
    const res = await fetch(`${BASE_URL}/api/sales`, {
      headers: { 'Cookie': sessionCookie }
    });
    const sales = await res.json();
    test('1.3 - List sales', res.ok, `${sales?.length || 0} ventas`);
  } catch (error) {
    test('1.3 - List sales', false, error.message);
  }
}

// =============================================================================
// SECTION 2: CUPONES
// =============================================================================
async function testCoupons() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('2️⃣  CUPONES', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  let couponCode = null;

  // Test: Create coupon PERCENT
  try {
    const res = await fetch(`${BASE_URL}/api/coupons`, {
      method: 'POST',
      headers: { 
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: `TEST${Date.now()}`,
        type: 'PERCENT',
        value: 10,
        maxUses: 100
      })
    });
    const coupon = await res.json();
    if (res.ok) {
      couponCode = coupon.code;
      test('2.1 - Create coupon PERCENT', true, `Code: ${coupon.code}`);
    } else {
      test('2.1 - Create coupon PERCENT', false, coupon.message || 'Error');
    }
  } catch (error) {
    test('2.1 - Create coupon PERCENT', false, error.message);
  }

  // Test: List coupons
  try {
    const res = await fetch(`${BASE_URL}/api/coupons`, {
      headers: { 'Cookie': sessionCookie }
    });
    const coupons = await res.json();
    test('2.2 - List coupons', res.ok, `${coupons?.length || 0} cupones`);
  } catch (error) {
    test('2.2 - List coupons', false, error.message);
  }

  // Test: Validate invalid coupon
  try {
    const res = await fetch(`${BASE_URL}/api/coupons/validate`, {
      method: 'POST',
      headers: { 
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: 'INVALID_CODE_XXXXX',
        total: 100
      })
    });
    test('2.3 - Validate invalid coupon', !res.ok, 'Rechazado como esperado');
  } catch (error) {
    test('2.3 - Validate invalid coupon', false, error.message);
  }

  // Test: Validate valid coupon
  if (couponCode) {
    try {
      const res = await fetch(`${BASE_URL}/api/coupons/validate`, {
        method: 'POST',
        headers: { 
          'Cookie': sessionCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: couponCode,
          total: 100
        })
      });
      if (res.ok) {
        const data = await res.json();
        test('2.4 - Validate valid coupon', data.valid && data.discount > 0, `Descuento: ${data.discount || 0}`);
      } else {
        test('2.4 - Validate valid coupon', false, `Status: ${res.status}`);
      }
    } catch (error) {
      test('2.4 - Validate valid coupon', false, error.message);
    }
  } else {
    skip('2.4 - Validate valid coupon', 'No se creó cupón de test');
  }
}

// =============================================================================
// SECTION 3: AUDITORÍA
// =============================================================================
async function testAudit() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('3️⃣  AUDITORÍA', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  // Test: Get all audit logs
  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs`, {
      headers: { 'Cookie': sessionCookie }
    });
    const data = await res.json();
    test('3.1 - Get all audit logs', res.ok, `${data.logs?.length || 0} logs`);
  } catch (error) {
    test('3.1 - Get all audit logs', false, error.message);
  }

  // Test: Filter by action
  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs?action=SALE_CHECKOUT_SUCCESS`, {
      headers: { 'Cookie': sessionCookie }
    });
    const data = await res.json();
    test('3.2 - Filter by action', res.ok, `Filtro funciona`);
  } catch (error) {
    test('3.2 - Filter by action', false, error.message);
  }

  // Test: Filter by severity
  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs?severity=ERROR`, {
      headers: { 'Cookie': sessionCookie }
    });
    const data = await res.json();
    test('3.3 - Filter by severity', res.ok, `${data.logs?.length || 0} errores`);
  } catch (error) {
    test('3.3 - Filter by severity', false, error.message);
  }

  // Test: Filter by entity type
  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs?entityType=SALE`, {
      headers: { 'Cookie': sessionCookie }
    });
    const data = await res.json();
    test('3.4 - Filter by entity type', res.ok, `Filtro por entidad funciona`);
  } catch (error) {
    test('3.4 - Filter by entity type', false, error.message);
  }

  // Test: Pagination
  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs?page=1&limit=10`, {
      headers: { 'Cookie': sessionCookie }
    });
    if (res.ok) {
      const data = await res.json();
      const logsCount = data.logs?.length || 0;
      test('3.5 - Pagination works', logsCount <= 10, `${logsCount} logs (max 10)`);
    } else {
      test('3.5 - Pagination works', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('3.5 - Pagination works', false, error.message);
  }
}

// =============================================================================
// SECTION 4: FEATURE FLAGS
// =============================================================================
async function testFeatureFlags() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('4️⃣  FEATURE FLAGS', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  // Test: Get all flags
  try {
    const res = await fetch(`${BASE_URL}/api/admin/feature-flags`, {
      headers: { 'Cookie': sessionCookie }
    });
    const flags = await res.json();
    test('4.1 - Get all feature flags', res.ok, `${flags?.length || 0} flags`);
  } catch (error) {
    test('4.1 - Get all feature flags', false, error.message);
  }

  // Test: Toggle flag OFF
  try {
    const res = await fetch(`${BASE_URL}/api/admin/feature-flags`, {
      method: 'PUT',
      headers: { 
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: 'ALLOW_COUPONS',
        enabled: false
      })
    });
    if (res.ok) {
      test('4.2 - Toggle flag OFF', true, 'ALLOW_COUPONS = false');
    } else {
      test('4.2 - Toggle flag OFF', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('4.2 - Toggle flag OFF', false, error.message);
  }

  // Test: Toggle flag ON
  try {
    const res = await fetch(`${BASE_URL}/api/admin/feature-flags`, {
      method: 'PUT',
      headers: { 
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: 'ALLOW_COUPONS',
        enabled: true
      })
    });
    if (res.ok) {
      test('4.3 - Toggle flag ON', true, 'ALLOW_COUPONS = true');
    } else {
      test('4.3 - Toggle flag ON', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('4.3 - Toggle flag ON', false, error.message);
  }

  // Test: Verify flag state
  try {
    const res = await fetch(`${BASE_URL}/api/admin/feature-flags`, {
      headers: { 'Cookie': sessionCookie }
    });
    if (res.ok) {
      const data = await res.json();
      const flags = Array.isArray(data) ? data : (data.flags || []);
      if (Array.isArray(flags)) {
        const couponFlag = flags.find(f => f.key === 'ALLOW_COUPONS');
        test('4.4 - Verify flag state', couponFlag?.enabled === true, `Estado: ${couponFlag?.enabled}`);
      } else {
        test('4.4 - Verify flag state', false, 'Response no es array');
      }
    } else {
      test('4.4 - Verify flag state', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('4.4 - Verify flag state', false, error.message);
  }
}

// =============================================================================
// SECTION 5: LÍMITES OPERATIVOS
// =============================================================================
async function testOperationalLimits() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('5️⃣  LÍMITES OPERATIVOS', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  // Test: Get limits
  try {
    const res = await fetch(`${BASE_URL}/api/admin/operational-limits`, {
      headers: { 'Cookie': sessionCookie }
    });
    if (res.ok) {
      const limits = await res.json();
      test('5.1 - Get operational limits', true, 'Configuración obtenida');
    } else {
      test('5.1 - Get operational limits', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('5.1 - Get operational limits', false, error.message);
  }

  // Test: Update limits
  try {
    const res = await fetch(`${BASE_URL}/api/admin/operational-limits`, {
      method: 'PUT',
      headers: { 
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        maxDiscountPercent: 20,
        maxSaleTotal: 1000
      })
    });
    if (res.ok) {
      test('5.2 - Update limits', true, 'Límites actualizados');
    } else {
      test('5.2 - Update limits', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('5.2 - Update limits', false, error.message);
  }

  // Test: Verify limits updated
  try {
    const res = await fetch(`${BASE_URL}/api/admin/operational-limits`, {
      headers: { 'Cookie': sessionCookie }
    });
    if (res.ok) {
      const limits = await res.json();
      const correct = Number(limits.maxDiscountPercent) === 20 && Number(limits.maxSaleTotal) === 1000;
      test('5.3 - Verify limits updated', correct, `MaxDiscount: ${limits.maxDiscountPercent}, MaxSale: ${limits.maxSaleTotal}`);
    } else {
      test('5.3 - Verify limits updated', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('5.3 - Verify limits updated', false, error.message);
  }

  // Test: Clear limits (set to null)
  try {
    const res = await fetch(`${BASE_URL}/api/admin/operational-limits`, {
      method: 'PUT',
      headers: { 
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        maxDiscountPercent: null,
        maxSaleTotal: null
      })
    });
    if (res.ok) {
      test('5.4 - Clear limits', true, 'Límites removidos');
    } else {
      test('5.4 - Clear limits', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('5.4 - Clear limits', false, error.message);
  }
}

// =============================================================================
// SECTION 6: REPORTES Y DATOS
// =============================================================================
async function testReports() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('6️⃣  REPORTES Y DATOS', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  // Test: Shifts history
  try {
    const res = await fetch(`${BASE_URL}/api/admin/shifts`, {
      headers: { 'Cookie': sessionCookie }
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const shifts = await res.json();
        test('6.1 - Shifts history', true, `${shifts?.length || 0} turnos`);
      } else {
        test('6.1 - Shifts history', false, 'Response no es JSON');
      }
    } else {
      test('6.1 - Shifts history', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('6.1 - Shifts history', false, error.message);
  }

  // Test: Customers list
  try {
    const res = await fetch(`${BASE_URL}/api/customers`, {
      headers: { 'Cookie': sessionCookie }
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const customers = await res.json();
        test('6.2 - Customers list', true, `${customers?.length || 0} clientes`);
      } else {
        test('6.2 - Customers list', false, 'Response no es JSON');
      }
    } else {
      test('6.2 - Customers list', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('6.2 - Customers list', false, error.message);
  }

  // Test: FIADO receivables
  try {
    const res = await fetch(`${BASE_URL}/api/receivables`, {
      headers: { 'Cookie': sessionCookie }
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const receivables = await res.json();
        test('6.3 - FIADO receivables', true, `${receivables?.length || 0} cuentas por cobrar`);
      } else {
        test('6.3 - FIADO receivables', false, 'Response no es JSON');
      }
    } else {
      test('6.3 - FIADO receivables', false, `Status: ${res.status}`);
    }
  } catch (error) {
    test('6.3 - FIADO receivables', false, error.message);
  }
}

// =============================================================================
// SECTION 7: SEGURIDAD Y PERMISOS
// =============================================================================
async function testSecurity() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('7️⃣  SEGURIDAD Y PERMISOS', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  // Test: Access audit without session
  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs`);
    test('7.1 - Block audit without session', !res.ok, 'Acceso denegado correctamente');
  } catch (error) {
    test('7.1 - Block audit without session', false, error.message);
  }

  // Test: Access feature flags without session
  try {
    const res = await fetch(`${BASE_URL}/api/admin/feature-flags`);
    test('7.2 - Block flags without session', !res.ok, 'Acceso denegado correctamente');
  } catch (error) {
    test('7.2 - Block flags without session', false, error.message);
  }

  // Test: Access limits without session
  try {
    const res = await fetch(`${BASE_URL}/api/admin/operational-limits`);
    test('7.3 - Block limits without session', !res.ok, 'Acceso denegado correctamente');
  } catch (error) {
    test('7.3 - Block limits without session', false, error.message);
  }

  // Test: Invalid credentials
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@bodega.com',
        password: 'wrongpassword'
      })
    });
    test('7.4 - Reject invalid credentials', !res.ok, 'Login rechazado correctamente');
  } catch (error) {
    test('7.4 - Reject invalid credentials', false, error.message);
  }
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     MÓDULO 15 - FASE 5: STABILITY TESTS COMPLETE           ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan');

  // Verificar servidor
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      log('❌ ERROR: Servidor no está corriendo en http://localhost:3000', 'red');
      log('   Ejecuta: npm run dev\n', 'yellow');
      process.exit(1);
    }
    log('✅ Servidor detectado\n', 'green');
  } catch (error) {
    log('❌ No se puede conectar al servidor\n', 'red');
    process.exit(1);
  }

  const startTime = Date.now();

  // Setup
  if (!await setup()) {
    log('❌ Setup falló - abortando tests\n', 'red');
    process.exit(1);
  }

  // Run all tests
  await testBasicAPIs();
  await testCoupons();
  await testAudit();
  await testFeatureFlags();
  await testOperationalLimits();
  await testReports();
  await testSecurity();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Resumen
  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                      RESULTADO FINAL                         ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan');

  log(`✅ Passed:  ${results.passed}`, results.passed > 0 ? 'green' : 'reset');
  log(`❌ Failed:  ${results.failed}`, results.failed > 0 ? 'red' : 'reset');
  log(`⏭️  Skipped: ${results.skipped}`, results.skipped > 0 ? 'yellow' : 'reset');
  log(`⏱️  Duration: ${duration}s\n`, 'cyan');

  const percentage = results.passed + results.failed > 0 
    ? ((results.passed / (results.passed + results.failed)) * 100).toFixed(1)
    : 0;

  log(`Success Rate: ${percentage}%\n`, 'cyan');

  if (results.failed === 0 && results.passed > 0) {
    log('🎉 TODOS LOS TESTS PASARON!\n', 'green');
  } else if (results.failed > 0) {
    log(`⚠️  ${results.failed} tests fallaron\n`, 'yellow');
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

if (typeof fetch === 'undefined') {
  console.error('❌ Este script requiere Node.js 18+ (fetch nativo)');
  process.exit(1);
}

main();
