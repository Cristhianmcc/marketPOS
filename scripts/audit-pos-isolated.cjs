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
    console: { log() {}, info() {}, error() {} },
  }, { filename });
  return exports;
}

const next = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };

async function main() {
  let failures = 0;
  const activeOwner = {
    id: 'owner-b', email: 'owner-b@example.invalid', name: 'Test Owner',
    role: 'OWNER', storeId: 'store-b', active: true,
  };

  async function probeSwitchStore({ sessionUser, body, store, requestedUser }) {
    let adoptedSession;
    let targetUserQuery;
    const route = loadRoute('src/app/api/setup/switch-store/route.ts', {
      'next/server': next,
      '@/lib/prisma': { prisma: {
        store: { findUnique: async () => store },
        user: { findFirst: async args => {
          targetUserQuery = args;
          if (!requestedUser) return null;
          const where = args.where || {};
          return requestedUser.id === where.id
            && requestedUser.storeId === where.storeId
            && requestedUser.role === where.role
            && requestedUser.active === where.active
            ? requestedUser
            : null;
        } },
      } },
      '@/lib/session': {
        getCurrentUser: async () => sessionUser,
        setSession: async data => { adoptedSession = data; },
      },
      '@/lib/superadmin': {
        isSuperAdmin: email => email === 'admin@example.invalid',
      },
    });
    const result = await route.POST({ json: async () => body });
    return { result, adoptedSession, targetUserQuery };
  }

  const activeStore = { id: 'store-b', name: 'Test B', status: 'ACTIVE', users: [activeOwner] };
  const forbiddenRoles = [
    { userId: 'cashier-a', storeId: 'store-a', email: 'cashier@example.invalid', role: 'CASHIER', isLoggedIn: true },
    { userId: 'owner-a', storeId: 'store-a', email: 'owner@example.invalid', role: 'OWNER', isLoggedIn: true },
  ];
  for (const sessionUser of forbiddenRoles) {
    const { result, adoptedSession } = await probeSwitchStore({
      sessionUser, body: { storeId: 'store-b' }, store: activeStore,
    });
    const denied = result.status === 403 && !adoptedSession;
    console.log(`${denied ? 'PASS' : 'FAIL'} H01: ${sessionUser.role} cannot adopt an OWNER session. Observed status=${result.status}`);
    if (!denied) failures++;
  }

  const superadmin = {
    userId: 'admin@example.invalid', storeId: null, email: 'admin@example.invalid',
    role: 'SUPERADMIN', isLoggedIn: true,
  };
  const allowed = await probeSwitchStore({
    sessionUser: superadmin, body: { storeId: 'store-b' }, store: activeStore,
  });
  const validAdoption = allowed.result.status === 200
    && allowed.adoptedSession?.userId === activeOwner.id
    && allowed.adoptedSession?.storeId === activeStore.id;
  console.log(`${validAdoption ? 'PASS' : 'FAIL'} H01: SUPERADMIN can adopt the active OWNER of an active store.`);
  if (!validAdoption) failures++;

  const crossStore = await probeSwitchStore({
    sessionUser: superadmin,
    body: { storeId: 'store-b', userId: 'owner-a' },
    store: activeStore,
    requestedUser: { ...activeOwner, id: 'owner-a', storeId: 'store-a' },
  });
  const crossStoreDenied = crossStore.result.status === 404
    && !crossStore.adoptedSession
    && crossStore.targetUserQuery?.where?.storeId === activeStore.id;
  console.log(`${crossStoreDenied ? 'PASS' : 'FAIL'} H01: SUPERADMIN cannot adopt a user outside the requested store.`);
  if (!crossStoreDenied) failures++;

  const inactive = await probeSwitchStore({
    sessionUser: superadmin,
    body: { storeId: 'store-b', userId: 'owner-b' },
    store: activeStore,
    requestedUser: { ...activeOwner, active: false },
  });
  const inactiveDenied = inactive.result.status === 404
    && !inactive.adoptedSession
    && inactive.targetUserQuery?.where?.active === true;
  console.log(`${inactiveDenied ? 'PASS' : 'FAIL'} H01: inactive OWNER accounts cannot be adopted.`);
  if (!inactiveDenied) failures++;

  const archived = await probeSwitchStore({
    sessionUser: superadmin,
    body: { storeId: 'store-b' },
    store: { ...activeStore, status: 'ARCHIVED' },
  });
  const archivedDenied = archived.result.status === 409 && !archived.adoptedSession;
  console.log(`${archivedDenied ? 'PASS' : 'FAIL'} H01: archived stores cannot be adopted.`);
  if (!archivedDenied) failures++;

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
