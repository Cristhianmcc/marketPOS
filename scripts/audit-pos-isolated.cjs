/** Audit probes: executes real route code with in-memory dependencies only.
 * No database, network, application startup, or real sessions are used.
 * Exit 1 means the security invariant is currently violated.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

function loadRoute(relativePath, dependencies) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`);
      return dependencies[name];
    },
    console: { log() {}, error() {} },
  }, { filename });
  return exports;
}

const next = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };

async function main() {
  let failures = 0;
  let adoptedSession;
  const route = loadRoute('src/app/api/setup/switch-store/route.ts', {
    'next/server': next,
    '@/lib/prisma': { prisma: {
      store: { findUnique: async () => ({ id: 'store-b', name: 'Test B', users: [
        { id: 'owner-b', email: 'owner-b@example.invalid', name: 'Test Owner', role: 'OWNER', storeId: 'store-b' },
      ] }) },
    } },
    '@/lib/session': {
      getCurrentUser: async () => ({ userId: 'cashier-a', storeId: 'store-a', role: 'CASHIER', isLoggedIn: true }),
      setSession: async data => { adoptedSession = data; },
    },
  });
  const result = await route.POST({ json: async () => ({ storeId: 'store-b' }) });
  const denied = result.status === 403 && !adoptedSession;
  console.log(`${denied ? 'PASS' : 'FAIL'} H01: CASHIER switching to another store must be denied. Observed status=${result.status}, adoptedRole=${adoptedSession?.role || 'none'}`);
  if (!denied) failures++;

  let createdOrder;
  let productOwnershipLookups = 0;
  const purchaseRoute = loadRoute('src/app/api/purchase-orders/route.ts', {
    'next/server': next,
    '@/lib/session': { getCurrentUser: async () => ({ userId: 'owner-a', storeId: 'store-a', role: 'OWNER' }) },
    '@/lib/featureFlags': { isFeatureEnabled: async () => true },
    '@prisma/client': { FeatureFlagKey: { ENABLE_SUPPLIERS: 'ENABLE_SUPPLIERS' }, Prisma: {} },
    '@/infra/db/prisma': { prisma: {
      supplier: { findFirst: async () => ({ id: 'supplier-a', storeId: 'store-a' }) },
      storeProduct: { findMany: async () => { productOwnershipLookups++; return []; }, findFirst: async () => { productOwnershipLookups++; return null; } },
      purchaseOrder: {
        findFirst: async () => null,
        create: async args => { createdOrder = args.data; return { id: 'test-order', ...args.data }; },
      },
    } },
  });
  const purchase = await purchaseRoute.POST({ json: async () => ({
    supplierId: 'supplier-a', items: [{ storeProductId: 'product-from-store-b', quantityOrdered: 1, unitCost: 1 }],
  }) });
  const productDenied = purchase.status >= 400 && !createdOrder;
  console.log(`${productDenied ? 'PASS' : 'FAIL'} H09: purchase order must reject a foreign store product. Observed status=${purchase.status}, ownershipLookups=${productOwnershipLookups}`);
  if (!productDenied) failures++;
  process.exitCode = failures ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 2; });
