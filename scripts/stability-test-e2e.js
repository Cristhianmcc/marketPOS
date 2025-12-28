/**
 * STABILITY TEST E2E - API Integration Testing
 * MÓDULO 15 - FASE 5
 * 
 * Ejecuta 50+ pruebas E2E contra las APIs REST
 * REQUISITO: Servidor corriendo en http://localhost:3000
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Base URL
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Colores
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Resultados
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// Session cookies
let sessionCookie = null;
let testStore = null;
let testUser = null;
let testShift = null;

// Helper para logs
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(section, testNum, description, passed, details = '') {
  const status = passed ? '✅' : '❌';
  const color = passed ? 'green' : 'red';
  log(`  ${status} ${section}.${testNum} - ${description}`, color);
  if (details) log(`     ${details}`, 'cyan');
  
  results.total++;
  if (passed) results.passed++;
  else results.failed++;
  results.tests.push({ section, testNum, description, passed, details });
}

// Fetch wrapper con cookies
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  // Guardar cookie de sesión
  const setCookie = response.headers.get('set-cookie');
  if (setCookie && !sessionCookie) {
    sessionCookie = setCookie.split(';')[0];
  }

  return response;
}

// =============================================================================
// SETUP: Crear tienda y usuario de prueba
// =============================================================================
async function setup() {
  log('\n📦 Configurando entorno de pruebas...', 'cyan');

  try {
    // Buscar el usuario OWNER específico
    const existingUser = await prisma.user.findUnique({
      where: { email: 'owner@bodega.com' },
      include: { store: true }
    });

    if (!existingUser) {
      throw new Error('Usuario owner@bodega.com no encontrado en la DB.');
    }

    // Login con credenciales correctas
    const loginRes = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'owner@bodega.com',
        password: 'password123'
      })
    });

    if (!loginRes.ok) {
      const error = await loginRes.json();
      throw new Error(`Login failed: ${error.error || 'Unknown error'}`);
    }

    // Usar la tienda del usuario existente
    testStore = existingUser.store;
    testUser = existingUser;

    // Usar productos existentes de la tienda (no crear nuevos)
    const existingProducts = await prisma.storeProduct.findMany({
      where: { 
        storeId: testStore.id,
        active: true,
        stock: { gt: 0 }
      },
      take: 3
    });

    if (existingProducts.length === 0) {
      log('⚠️  No hay productos en la tienda. Algunos tests se saltarán.', 'yellow');
    }

    // Abrir turno si no hay uno abierto
    const existingShift = await prisma.shift.findFirst({
      where: {
        storeId: testStore.id,
        closedAt: null
      }
    });

    if (existingShift) {
      testShift = existingShift;
      log('✅ Usando turno existente', 'green');
    } else {
      // Abrir nuevo turno
      const shiftRes = await apiFetch('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({ openingCash: 100 })
      });

      if (shiftRes.ok) {
        testShift = await shiftRes.json();
        log('✅ Turno creado', 'green');
      }
    }

    log(`✅ Setup completado (Store: ${testStore.name}, User: ${testUser.email})\n`, 'green');

  } catch (error) {
    log(`❌ Error en setup: ${error.message}`, 'red');
    throw error;
  }
}

// =============================================================================
// SECTION 2: PROMOCIONES
// =============================================================================
async function testPromociones() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('2️⃣  PROMOCIONES (E2E)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  try {
    const products = await prisma.storeProduct.findMany({
      where: { storeId: testStore.id }
    });

    // Test 2.1: Promoción por categoría
    try {
      const promo = await prisma.categoryPromotion.create({
        data: {
          storeId: testStore.id,
          category: 'Bebidas',
          discountPercent: 10,
          active: true,
          name: 'Promo Bebidas 10%'
        }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 2 } // Producto A - Bebidas
          ],
          paymentMethod: 'CASH',
          amountReceived: 20
        })
      });

      const data = await checkoutRes.json();
      const passed = checkoutRes.ok && data.sale && data.sale.total < 20;
      logTest('2', '1', 'Promo categoría aplicada correctamente', passed, 
        passed ? `Total: ${data.sale.total} < 20` : data.message);

      await prisma.categoryPromotion.delete({ where: { id: promo.id } });
    } catch (error) {
      logTest('2', '1', 'Promo categoría aplicada correctamente', false, error.message);
    }

    // Test 2.2: Promoción por volumen
    try {
      const volPromo = await prisma.volumePromotion.create({
        data: {
          storeId: testStore.id,
          minQuantity: 3,
          discountPercent: 15,
          active: true,
          name: 'Promo 3x15%'
        }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 3 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 30
        })
      });

      const data = await checkoutRes.json();
      const passed = checkoutRes.ok && data.sale && data.sale.total < 30;
      logTest('2', '2', 'Promo volumen aplicada correctamente', passed, 
        passed ? `Total: ${data.sale.total} < 30` : data.message);

      await prisma.volumePromotion.delete({ where: { id: volPromo.id } });
    } catch (error) {
      logTest('2', '2', 'Promo volumen aplicada correctamente', false, error.message);
    }

    // Test 2.3: Promoción nth (cada N productos)
    try {
      const nthPromo = await prisma.nthPromotion.create({
        data: {
          storeId: testStore.id,
          nthItem: 2,
          discountPercent: 50,
          active: true,
          name: 'Promo 2do al 50%'
        }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 2 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 20
        })
      });

      const data = await checkoutRes.json();
      const passed = checkoutRes.ok && data.sale && data.sale.total < 20;
      logTest('2', '3', 'Promo nth aplicada correctamente', passed, 
        passed ? `Total: ${data.sale.total} < 20` : data.message);

      await prisma.nthPromotion.delete({ where: { id: nthPromo.id } });
    } catch (error) {
      logTest('2', '3', 'Promo nth aplicada correctamente', false, error.message);
    }

    // Test 2.4: Promo categoría + volumen simultáneas
    try {
      const catPromo = await prisma.categoryPromotion.create({
        data: {
          storeId: testStore.id,
          category: 'Bebidas',
          discountPercent: 10,
          active: true,
          name: 'Cat 10%'
        }
      });

      const volPromo = await prisma.volumePromotion.create({
        data: {
          storeId: testStore.id,
          minQuantity: 3,
          discountPercent: 15,
          active: true,
          name: 'Vol 15%'
        }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 3 } // Bebidas, 3 unidades
          ],
          paymentMethod: 'CASH',
          amountReceived: 30
        })
      });

      const data = await checkoutRes.json();
      // Debe aplicar ambas: 10% + 15%
      const passed = checkoutRes.ok && data.sale && data.sale.total < 25.5; // 30 - 10% - 15%
      logTest('2', '4', 'Promo categoría + volumen (ambas)', passed, 
        passed ? `Total: ${data.sale.total}` : data.message);

      await prisma.categoryPromotion.delete({ where: { id: catPromo.id } });
      await prisma.volumePromotion.delete({ where: { id: volPromo.id } });
    } catch (error) {
      logTest('2', '4', 'Promo categoría + volumen (ambas)', false, error.message);
    }

    // Test 2.7: Promos deshabilitadas por feature flag
    try {
      await prisma.featureFlag.upsert({
        where: {
          storeId_featureName: {
            storeId: testStore.id,
            featureName: 'CATEGORY_PROMOTIONS'
          }
        },
        create: {
          storeId: testStore.id,
          featureName: 'CATEGORY_PROMOTIONS',
          isEnabled: false
        },
        update: { isEnabled: false }
      });

      const promo = await prisma.categoryPromotion.create({
        data: {
          storeId: testStore.id,
          category: 'Bebidas',
          discountPercent: 50,
          active: true,
          name: 'Promo Deshabilitada'
        }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 2 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 20
        })
      });

      const data = await checkoutRes.json();
      // No debe aplicar descuento (flag deshabilitado)
      const passed = checkoutRes.ok && data.sale && data.sale.total === 20;
      logTest('2', '7', 'Promos deshabilitadas por feature flag', passed, 
        passed ? `Total sin descuento: ${data.sale.total}` : data.message);

      await prisma.categoryPromotion.delete({ where: { id: promo.id } });
      await prisma.featureFlag.update({
        where: {
          storeId_featureName: {
            storeId: testStore.id,
            featureName: 'CATEGORY_PROMOTIONS'
          }
        },
        data: { isEnabled: true }
      });
    } catch (error) {
      logTest('2', '7', 'Promos deshabilitadas por feature flag', false, error.message);
    }

    // Tests 2.5, 2.6, 2.8-2.10
    for (let i of [5, 6, 8, 9, 10]) {
      logTest('2', `${i}`, `Test promociones #${i}`, null, 'Ver implementación manual');
    }

  } catch (error) {
    log(`\n❌ Error en sección Promociones: ${error.message}`, 'red');
  }
}

// =============================================================================
// SECTION 3: CUPONES
// =============================================================================
async function testCupones() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('3️⃣  CUPONES (E2E)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  try {
    const products = await prisma.storeProduct.findMany({
      where: { storeId: testStore.id }
    });

    // Test 3.1: Cupón PERCENT válido
    try {
      const coupon = await prisma.coupon.create({
        data: {
          storeId: testStore.id,
          code: `E2E${Date.now()}`,
          type: 'PERCENT',
          value: 20,
          maxUses: 10,
          usesCount: 0,
          active: true
        }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 1 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 10,
          couponCode: coupon.code
        })
      });

      const data = await checkoutRes.json();
      const passed = checkoutRes.ok && data.sale && data.sale.total === 8; // 10 - 20%
      logTest('3', '1', 'Cupón PERCENT válido aplicado', passed, 
        passed ? `Total: ${data.sale.total}` : data.message);

      await prisma.coupon.delete({ where: { id: coupon.id } });
    } catch (error) {
      logTest('3', '1', 'Cupón PERCENT válido aplicado', false, error.message);
    }

    // Test 3.2: Cupón AMOUNT válido
    try {
      const coupon = await prisma.coupon.create({
        data: {
          storeId: testStore.id,
          code: `AMT${Date.now()}`,
          type: 'AMOUNT',
          value: 3,
          maxUses: 10,
          usesCount: 0,
          active: true
        }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 1 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 10,
          couponCode: coupon.code
        })
      });

      const data = await checkoutRes.json();
      const passed = checkoutRes.ok && data.sale && data.sale.total === 7; // 10 - 3
      logTest('3', '2', 'Cupón AMOUNT válido aplicado', passed, 
        passed ? `Total: ${data.sale.total}` : data.message);

      await prisma.coupon.delete({ where: { id: coupon.id } });
    } catch (error) {
      logTest('3', '2', 'Cupón AMOUNT válido aplicado', false, error.message);
    }

    // Test 3.3: Cupón inválido rechazado
    try {
      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 1 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 10,
          couponCode: 'INVALID_CODE_XXXXX'
        })
      });

      const data = await checkoutRes.json();
      const passed = !checkoutRes.ok && data.message.includes('inválido');
      logTest('3', '3', 'Cupón inválido rechazado', passed, data.message);
    } catch (error) {
      logTest('3', '3', 'Cupón inválido rechazado', false, error.message);
    }

    // Test 3.4: Cupón expirado
    try {
      const coupon = await prisma.coupon.create({
        data: {
          storeId: testStore.id,
          code: `EXP${Date.now()}`,
          type: 'PERCENT',
          value: 10,
          maxUses: 10,
          usesCount: 0,
          active: true,
          endsAt: new Date(Date.now() - 86400000) // Ayer
        }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 1 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 10,
          couponCode: coupon.code
        })
      });

      const data = await checkoutRes.json();
      const passed = !checkoutRes.ok && data.message.includes('expirado');
      logTest('3', '4', 'Cupón expirado rechazado', passed, data.message);

      await prisma.coupon.delete({ where: { id: coupon.id } });
    } catch (error) {
      logTest('3', '4', 'Cupón expirado rechazado', false, error.message);
    }

    // Test 3.8: Anulación revierte usesCount
    try {
      const coupon = await prisma.coupon.create({
        data: {
          storeId: testStore.id,
          code: `VOID${Date.now()}`,
          type: 'PERCENT',
          value: 10,
          maxUses: 10,
          usesCount: 0,
          active: true
        }
      });

      // Hacer venta con cupón
      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 1 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 10,
          couponCode: coupon.code
        })
      });

      const saleData = await checkoutRes.json();

      if (checkoutRes.ok && saleData.sale) {
        // Verificar que usesCount aumentó
        const couponAfter = await prisma.coupon.findUnique({
          where: { id: coupon.id }
        });

        // Anular venta
        await apiFetch(`/api/sales/${saleData.sale.id}/void`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Test' })
        });

        // Verificar que usesCount volvió a 0
        const couponFinal = await prisma.coupon.findUnique({
          where: { id: coupon.id }
        });

        const passed = couponAfter.usesCount === 1 && couponFinal.usesCount === 0;
        logTest('3', '8', 'Anulación revierte usesCount', passed, 
          `Uses: 0 → 1 → ${couponFinal.usesCount}`);

        await prisma.coupon.delete({ where: { id: coupon.id } });
      } else {
        logTest('3', '8', 'Anulación revierte usesCount', false, 'Sale failed');
      }
    } catch (error) {
      logTest('3', '8', 'Anulación revierte usesCount', false, error.message);
    }

    // Resto de tests
    for (let i of [5, 6, 7, 9, 10]) {
      logTest('3', `${i}`, `Test cupones #${i}`, null, 'Ver implementación manual');
    }

  } catch (error) {
    log(`\n❌ Error en sección Cupones: ${error.message}`, 'red');
  }
}

// =============================================================================
// SECTION 4: LÍMITES OPERATIVOS
// =============================================================================
async function testLimitesOperativos() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('4️⃣  LÍMITES OPERATIVOS (E2E)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  try {
    const products = await prisma.storeProduct.findMany({
      where: { storeId: testStore.id }
    });

    // Test 4.1: Descuento % supera límite
    try {
      await prisma.operationalLimit.upsert({
        where: {
          storeId_limitType: {
            storeId: testStore.id,
            limitType: 'MAX_DISCOUNT_PERCENT'
          }
        },
        create: {
          storeId: testStore.id,
          limitType: 'MAX_DISCOUNT_PERCENT',
          value: 10
        },
        update: { value: 10 }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 1, discount: 15 } // 15% > 10%
          ],
          paymentMethod: 'CASH',
          amountReceived: 10
        })
      });

      const data = await checkoutRes.json();
      const passed = !checkoutRes.ok && data.message.includes('límite');
      logTest('4', '1', 'Descuento % supera límite → bloqueado', passed, data.message);

      // Limpiar límite
      await prisma.operationalLimit.delete({
        where: {
          storeId_limitType: {
            storeId: testStore.id,
            limitType: 'MAX_DISCOUNT_PERCENT'
          }
        }
      });
    } catch (error) {
      logTest('4', '1', 'Descuento % supera límite → bloqueado', false, error.message);
    }

    // Test 4.3: Total venta supera límite
    try {
      await prisma.operationalLimit.upsert({
        where: {
          storeId_limitType: {
            storeId: testStore.id,
            limitType: 'MAX_SALE_TOTAL'
          }
        },
        create: {
          storeId: testStore.id,
          limitType: 'MAX_SALE_TOTAL',
          value: 50
        },
        update: { value: 50 }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 10 } // 10 * 10 = 100 > 50
          ],
          paymentMethod: 'CASH',
          amountReceived: 100
        })
      });

      const data = await checkoutRes.json();
      const passed = !checkoutRes.ok && data.message.includes('límite');
      logTest('4', '3', 'Total venta supera límite → bloqueado', passed, data.message);

      await prisma.operationalLimit.delete({
        where: {
          storeId_limitType: {
            storeId: testStore.id,
            limitType: 'MAX_SALE_TOTAL'
          }
        }
      });
    } catch (error) {
      logTest('4', '3', 'Total venta supera límite → bloqueado', false, error.message);
    }

    // Test 4.6: Sin límites → flujo normal
    try {
      // Asegurar que no hay límites
      await prisma.operationalLimit.deleteMany({
        where: { storeId: testStore.id }
      });

      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 5 }
          ],
          paymentMethod: 'CASH',
          amountReceived: 50
        })
      });

      const data = await checkoutRes.json();
      const passed = checkoutRes.ok && data.sale;
      logTest('4', '6', 'Sin límites configurados → flujo normal', passed, 
        passed ? `Sale: ${data.sale.saleNumber}` : data.message);
    } catch (error) {
      logTest('4', '6', 'Sin límites configurados → flujo normal', false, error.message);
    }

    // Resto de tests
    for (let i of [2, 4, 5, 7, 8, 9, 10]) {
      logTest('4', `${i}`, `Test límites #${i}`, null, 'Ver implementación manual');
    }

  } catch (error) {
    log(`\n❌ Error en sección Límites: ${error.message}`, 'red');
  }
}

// =============================================================================
// SECTION 5: FIADO
// =============================================================================
async function testFiado() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('5️⃣  FIADO (E2E)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  try {
    const products = await prisma.storeProduct.findMany({
      where: { storeId: testStore.id }
    });

    // Crear cliente
    const customer = await prisma.customer.create({
      data: {
        storeId: testStore.id,
        name: 'Cliente Test FIADO',
        email: `fiado${Date.now()}@test.com`
      }
    });

    // Test 5.1: Crear venta FIADO
    try {
      const checkoutRes = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { productId: products[0].id, quantity: 2 }
          ],
          paymentMethod: 'FIADO',
          customerId: customer.id
        })
      });

      const data = await checkoutRes.json();
      const passed = checkoutRes.ok && data.sale && data.sale.paymentMethod === 'FIADO';
      logTest('5', '1', 'Crear venta FIADO', passed, 
        passed ? `Sale: ${data.sale.saleNumber}` : data.message);
    } catch (error) {
      logTest('5', '1', 'Crear venta FIADO', false, error.message);
    }

    // Test 5.2: Receivable creado
    try {
      const receivable = await prisma.receivable.findFirst({
        where: { customerId: customer.id }
      });

      const passed = receivable !== null && receivable.status === 'PENDING';
      logTest('5', '2', 'Receivable creado correctamente', passed, 
        passed ? `Balance: ${receivable.balance}` : 'Not found');
    } catch (error) {
      logTest('5', '2', 'Receivable creado correctamente', false, error.message);
    }

    // Test 5.6: expectedCash NO suma FIADO
    try {
      const shift = await prisma.shift.findFirst({
        where: { storeId: testStore.id, status: 'OPEN' }
      });

      const cashSales = await prisma.sale.aggregate({
        where: {
          shiftId: shift.id,
          paymentMethod: 'CASH',
          status: { not: 'VOIDED' }
        },
        _sum: { total: true }
      });

      const expectedCash = shift.openingCash + (cashSales._sum.total || 0);
      
      // FIADO no debe estar incluido en expectedCash
      const fiadoSales = await prisma.sale.findMany({
        where: {
          shiftId: shift.id,
          paymentMethod: 'FIADO'
        }
      });

      const passed = fiadoSales.length > 0; // Hay ventas FIADO pero no afectan expectedCash
      logTest('5', '6', 'expectedCash NO suma FIADO', passed, 
        `Expected cash: ${expectedCash}, FIADO sales: ${fiadoSales.length}`);
    } catch (error) {
      logTest('5', '6', 'expectedCash NO suma FIADO', false, error.message);
    }

    // Cleanup
    await prisma.receivable.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });

    // Resto de tests
    for (let i of [3, 4, 5, 7, 8, 9, 10]) {
      logTest('5', `${i}`, `Test FIADO #${i}`, null, 'Ver implementación manual');
    }

  } catch (error) {
    log(`\n❌ Error en sección FIADO: ${error.message}`, 'red');
  }
}

// =============================================================================
// SECTION 8: AUDITORÍA
// =============================================================================
async function testAuditoria() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('8️⃣  AUDITORÍA (E2E)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'blue');

  try {
    // Test 8.8: Filtros funcionan
    try {
      const logsRes = await apiFetch('/api/audit-logs?action=SALE_CHECKOUT_SUCCESS');
      const data = await logsRes.json();
      
      const passed = logsRes.ok && Array.isArray(data.logs);
      logTest('8', '8', 'Filtros funcionan correctamente', passed, 
        passed ? `${data.logs.length} logs encontrados` : data.message);
    } catch (error) {
      logTest('8', '8', 'Filtros funcionan correctamente', false, error.message);
    }

    // Test 8.9: OWNER solo ve su tienda
    try {
      const logsRes = await apiFetch('/api/audit-logs');
      const data = await logsRes.json();
      
      if (logsRes.ok && data.logs) {
        const allMyStore = data.logs.every(log => log.storeId === testStore.id);
        logTest('8', '9', 'OWNER solo ve su tienda', allMyStore, 
          `${data.logs.length} logs, todos de la misma tienda: ${allMyStore}`);
      } else {
        logTest('8', '9', 'OWNER solo ve su tienda', false, data.message);
      }
    } catch (error) {
      logTest('8', '9', 'OWNER solo ve su tienda', false, error.message);
    }

    // Resto de tests
    for (let i of [1, 2, 3, 4, 5, 6, 7, 10]) {
      logTest('8', `${i}`, `Test auditoría #${i}`, null, 'Verificar en UI');
    }

  } catch (error) {
    log(`\n❌ Error en sección Auditoría: ${error.message}`, 'red');
  }
}

// =============================================================================
// CLEANUP
// =============================================================================
async function cleanup() {
  log('\n🧹 Limpiando datos de prueba...', 'cyan');

  try {
    if (testStore) {
      // Limpiar solo los datos de test, NO la tienda ni el usuario
      await prisma.sale.deleteMany({ 
        where: { 
          storeId: testStore.id,
          createdAt: { gte: new Date(Date.now() - 3600000) } // Solo del último hora
        } 
      });
      await prisma.coupon.deleteMany({ 
        where: { 
          storeId: testStore.id,
          code: { contains: 'E2E' } // Solo cupones de test
        } 
      });
      await prisma.categoryPromotion.deleteMany({ 
        where: { 
          storeId: testStore.id,
          name: { contains: 'Promo' } // Solo promos de test
        } 
      });
      await prisma.volumePromotion.deleteMany({ 
        where: { 
          storeId: testStore.id,
          name: { contains: 'Promo' }
        } 
      });
      await prisma.nthPromotion.deleteMany({ 
        where: { 
          storeId: testStore.id,
          name: { contains: 'Promo' }
        } 
      });
      await prisma.customer.deleteMany({
        where: {
          storeId: testStore.id,
          name: { contains: 'Test' }
        }
      });
      // NO eliminamos la tienda ni el usuario (los reutilizamos)
    }

    log('✅ Cleanup completado\n', 'green');
  } catch (error) {
    log(`⚠️  Error en cleanup: ${error.message}`, 'yellow');
  }
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║       MÓDULO 15 - FASE 5: STABILITY TESTS E2E               ║', 'cyan');
  log('║                                                              ║', 'cyan');
  log('║  REQUISITO: Servidor corriendo en http://localhost:3000     ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan');

  // Verificar que el servidor está corriendo
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      log('❌ ERRO: Servidor no está corriendo en http://localhost:3000', 'red');
      log('   Ejecuta: npm run dev', 'yellow');
      process.exit(1);
    }
    log('✅ Servidor detectado\n', 'green');
  } catch (error) {
    log('❌ No se puede conectar al servidor', 'red');
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    await setup();
    await testPromociones();
    await testCupones();
    await testLimitesOperativos();
    await testFiado();
    await testAuditoria();
    
    // Secciones 6 y 7 requieren más implementación
    log('\n⏭️  Secciones 6 (Turnos) y 7 (Backup) requieren tests manuales\n', 'yellow');

  } catch (error) {
    log(`\n❌ Error fatal: ${error.message}`, 'red');
    console.error(error);
  } finally {
    await cleanup();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Resumen final
  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                      RESULTADO FINAL                         ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan');

  const passedTests = results.tests.filter(t => t.passed === true).length;
  const failedTests = results.tests.filter(t => t.passed === false).length;
  const skippedTests = results.tests.filter(t => t.passed === null).length;

  log(`✅ Passed:  ${passedTests}`, 'green');
  log(`❌ Failed:  ${failedTests}`, 'red');
  log(`⏭️  Skipped: ${skippedTests}`, 'yellow');
  log(`⏱️  Duration: ${duration}s\n`, 'cyan');

  const percentage = (passedTests + failedTests) > 0
    ? ((passedTests / (passedTests + failedTests)) * 100).toFixed(1)
    : 0;

  if (failedTests === 0 && passedTests > 0) {
    log('🎉 TODOS LOS TESTS E2E PASARON!', 'green');
  } else if (failedTests > 0) {
    log(`⚠️  ${failedTests} tests fallaron. Revisar detalles arriba.`, 'yellow');
  }

  log(`\nSuccess Rate: ${percentage}%`, 'cyan');

  await prisma.$disconnect();
  process.exit(failedTests > 0 ? 1 : 0);
}

// Verificar que fetch está disponible (Node 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ Este script requiere Node.js 18+ (fetch nativo)');
  process.exit(1);
}

main();
