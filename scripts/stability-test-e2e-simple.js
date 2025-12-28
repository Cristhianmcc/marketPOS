/**
 * STABILITY TEST E2E SIMPLE - Basic API Testing
 * MÓDULO 15 - FASE 5
 * 
 * Ejecuta tests E2E básicos contra las APIs REST
 * REQUISITO: Servidor corriendo en http://localhost:3000
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Colores
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// =============================================================================
// TESTS
// =============================================================================
async function runTests() {
  const results = { passed: 0, failed: 0, tests: [] };

  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║       MÓDULO 15 - FASE 5: STABILITY TESTS E2E (SIMPLE)     ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan');

  // Test 1: Health check
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      log('✅ 1. Health check - API respondiendo', 'green');
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 1. Health check - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 2: Login con credenciales correctas
  let sessionCookie = null;
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
      log('✅ 2. Login exitoso - Sesión obtenida', 'green');
      results.passed++;
    } else {
      const error = await res.json();
      throw new Error(error.error || 'Unknown error');
    }
  } catch (error) {
    log(`❌ 2. Login exitoso - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 3: Obtener usuario actual (requiere sesión)
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    
    if (res.ok) {
      const user = await res.json();
      log(`✅ 3. Get current user - ${user.email} (${user.role})`, 'green');
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 3. Get current user - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 4: Obtener turno actual
  try {
    const res = await fetch(`${BASE_URL}/api/shifts/current`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.shift) {
        log(`✅ 4. Get current shift - Turno activo encontrado`, 'green');
      } else {
        log(`✅ 4. Get current shift - No hay turno abierto (OK)`, 'green');
      }
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 4. Get current shift - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 5: Listar productos
  try {
    const res = await fetch(`${BASE_URL}/api/store-products`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    
    if (res.ok) {
      const products = await res.json();
      log(`✅ 5. List products - ${products.length} productos encontrados`, 'green');
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 5. List products - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 6: Listar ventas
  try {
    const res = await fetch(`${BASE_URL}/api/sales`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    
    if (res.ok) {
      const sales = await res.json();
      log(`✅ 6. List sales - ${sales.length} ventas encontradas`, 'green');
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 6. List sales - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 7: Obtener logs de auditoría (OWNER puede ver)
  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    
    if (res.ok) {
      const data = await res.json();
      log(`✅ 7. Get audit logs - ${data.logs?.length || 0} logs encontrados`, 'green');
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 7. Get audit logs - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 8: Filtrar audit logs por action
  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs?action=SALE_CHECKOUT_SUCCESS`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    
    if (res.ok) {
      const data = await res.json();
      log(`✅ 8. Filter audit logs - Filtro por action funciona`, 'green');
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 8. Filter audit logs - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 9: Obtener configuración de feature flags
  try {
    const res = await fetch(`${BASE_URL}/api/admin/feature-flags`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    
    if (res.ok) {
      const flags = await res.json();
      log(`✅ 9. Get feature flags - ${flags.length} flags configuradas`, 'green');
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 9. Get feature flags - ${error.message}`, 'red');
    results.failed++;
  }

  // Test 10: Obtener límites operativos
  try {
    const res = await fetch(`${BASE_URL}/api/admin/operational-limits`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    
    if (res.ok) {
      const limits = await res.json();
      log(`✅ 10. Get operational limits - Configuración obtenida`, 'green');
      results.passed++;
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (error) {
    log(`❌ 10. Get operational limits - ${error.message}`, 'red');
    results.failed++;
  }

  // Resumen
  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                      RESULTADO FINAL                         ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan');

  log(`✅ Passed:  ${results.passed}`, results.passed > 0 ? 'green' : 'reset');
  log(`❌ Failed:  ${results.failed}`, results.failed > 0 ? 'red' : 'reset');
  
  const percentage = results.passed + results.failed > 0 
    ? ((results.passed / (results.passed + results.failed)) * 100).toFixed(1)
    : 0;

  log(`\nSuccess Rate: ${percentage}%\n`, 'cyan');

  if (results.failed === 0 && results.passed > 0) {
    log('🎉 TODOS LOS TESTS E2E BÁSICOS PASARON!\n', 'green');
  }

  return results.failed === 0 ? 0 : 1;
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  // Verificar servidor
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      log('❌ ERROR: Servidor no está corriendo en http://localhost:3000', 'red');
      log('   Ejecuta: npm run dev\n', 'yellow');
      process.exit(1);
    }
  } catch (error) {
    log('❌ No se puede conectar al servidor\n', 'red');
    process.exit(1);
  }

  const exitCode = await runTests();
  process.exit(exitCode);
}

// Verificar que fetch está disponible (Node 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ Este script requiere Node.js 18+ (fetch nativo)');
  process.exit(1);
}

main();
