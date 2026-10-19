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

  const { cancelSaleLocally } = loadRoute('src/lib/sales/cancelSaleLocally.ts', {});
  const cancellationState = {
    total: 30,
    subtotal: 30,
    tax: 0,
    stock: 7,
    batches: new Map([
      ['LOT-A', { id: 'batch-a', quantityAvailable: 2 }],
      ['LOT-B', { id: 'batch-b', quantityAvailable: 5 }],
    ]),
    movements: [],
  };
  const cancelledSale = {
    id: 'sale-with-two-batches',
    storeId: 'store-a',
    saleNumber: 41,
    total: 30,
    subtotal: 30,
    tax: 0,
    paymentMethod: 'CASH',
    couponCode: null,
    couponDiscount: 0,
    items: [{
      storeProductId: 'product-a',
      isService: false,
      quantity: 3,
      batchBreakdown: [
        { batchNumber: 'LOT-A', qty: 1 },
        { batchNumber: 'LOT-B', qty: 2 },
      ],
    }],
  };
  const cancellationDb = {
    sale: {
      findUnique: async () => ({
        ...cancelledSale,
        total: cancellationState.total,
        subtotal: cancellationState.subtotal,
        tax: cancellationState.tax,
        items: cancelledSale.items.map(item => ({
          ...item,
          batchBreakdown: item.batchBreakdown.map(entry => ({ ...entry })),
        })),
      }),
    },
    $transaction: async callback => callback({
      sale: {
        updateMany: async () => {
          if (cancellationState.total === 0) return { count: 0 };
          cancellationState.total = 0;
          cancellationState.subtotal = 0;
          cancellationState.tax = 0;
          return { count: 1 };
        },
      },
      coupon: { findUnique: async () => null, update: async () => null },
      receivable: { updateMany: async () => ({ count: 0 }) },
      storeProduct: {
        update: async ({ data }) => {
          cancellationState.stock += Number(data.stock.increment);
        },
      },
      productBatch: {
        findFirst: async ({ where }) => cancellationState.batches.get(where.batchNumber) || null,
        update: async ({ where, data }) => {
          const batch = Array.from(cancellationState.batches.values()).find(entry => entry.id === where.id);
          batch.quantityAvailable += Number(data.quantityAvailable.increment);
        },
      },
      movement: {
        create: async ({ data }) => { cancellationState.movements.push(data); },
      },
    }),
  };

  const cancellationResults = await Promise.all([
    cancelSaleLocally(cancellationDb, cancelledSale.id, 'owner-a', 'audit probe'),
    cancelSaleLocally(cancellationDb, cancelledSale.id, 'owner-a', 'audit probe'),
  ]);
  const cancellationWinners = cancellationResults.filter(result => result.cancelled).length;
  const exactBatchRollback = cancellationState.stock === 10
    && cancellationState.batches.get('LOT-A').quantityAvailable === 3
    && cancellationState.batches.get('LOT-B').quantityAvailable === 7
    && cancellationState.movements.length === 2;
  const cancellationSafe = cancellationWinners === 1 && exactBatchRollback;
  console.log(`${cancellationSafe ? 'PASS' : 'FAIL'} H06/H07: cancellation restores both FEFO batches exactly once under concurrent requests. winners=${cancellationWinners}, stock=${cancellationState.stock}, movements=${cancellationState.movements.length}`);
  if (!cancellationSafe) failures++;

  class Decimal {
    constructor(value) { this.value = Number(value); }
    valueOf() { return this.value; }
    toNumber() { return this.value; }
  }
  const receivableState = {
    id: 'receivable-a', storeId: 'store-a', customerId: 'customer-a',
    balance: 100, status: 'OPEN', payments: new Map(),
  };
  const receivableSnapshot = () => ({
    id: receivableState.id,
    storeId: receivableState.storeId,
    customerId: receivableState.customerId,
    balance: receivableState.balance,
    status: receivableState.status,
    customer: { id: 'customer-a', name: 'Audit Customer' },
    sale: { saleNumber: 77, total: 100 },
  });
  const paymentWithReceivable = payment => payment
    ? { ...payment, receivable: receivableSnapshot() }
    : null;
  const paymentDb = {
    receivablePayment: {
      findUnique: async ({ where }) => paymentWithReceivable(receivableState.payments.get(where.id)),
    },
    $transaction: async callback => callback({
      receivable: {
        updateMany: async ({ where, data }) => {
          const decrement = Number(data.balance.decrement);
          if (where.id !== receivableState.id
            || where.storeId !== receivableState.storeId
            || receivableState.status !== 'OPEN'
            || receivableState.balance < decrement) return { count: 0 };
          receivableState.balance -= decrement;
          return { count: 1 };
        },
        findFirst: async ({ where }) => where.id === receivableState.id
          && where.storeId === receivableState.storeId
          ? receivableSnapshot()
          : null,
        update: async ({ data }) => {
          receivableState.status = data.status;
          return receivableSnapshot();
        },
      },
      receivablePayment: {
        create: async ({ data }) => {
          if (receivableState.payments.has(data.id)) {
            const error = new Error('Unique constraint');
            error.code = 'P2002';
            throw error;
          }
          const payment = { ...data, amount: Number(data.amount), createdAt: new Date('2026-10-18T12:00:00Z') };
          receivableState.payments.set(data.id, payment);
          return payment;
        },
      },
    }),
  };
  const paymentRoute = loadRoute('src/app/api/receivables/[id]/pay/route.ts', {
    'next/server': next,
    '@/infra/db/prisma': { prisma: paymentDb },
    '@/lib/session': { getSession: async () => ({ userId: 'owner-a', storeId: 'store-a' }) },
    '@prisma/client': { Prisma: { Decimal } },
    '@/infra/db/repositories/PrismaShiftRepository': {
      PrismaShiftRepository: class { async getCurrentShift() { return { id: 'shift-a' }; } },
    },
    '@/lib/auditLog': { logAudit: async () => {}, getRequestMetadata: () => ({}) },
    '@/lib/rateLimit': { checkRateLimit: () => ({ allowed: true, resetAt: Date.now() }) },
    crypto: require('crypto'),
  });
  const paymentRequest = (key, amount = 30) => ({
    headers: { get: name => name.toLowerCase() === 'idempotency-key' ? key : null },
    json: async () => ({ amount, method: 'CASH', notes: null }),
  });
  const paymentParams = { params: Promise.resolve({ id: receivableState.id }) };
  const concurrentPayments = await Promise.all([
    paymentRoute.POST(paymentRequest('payment-audit-key-1'), paymentParams),
    paymentRoute.POST(paymentRequest('payment-audit-key-2'), paymentParams),
  ]);
  const replayedPayment = await paymentRoute.POST(
    paymentRequest('payment-audit-key-1'), paymentParams
  );
  const concurrentPaymentSafe = concurrentPayments.every(response => response.status === 200)
    && receivableState.balance === 40
    && receivableState.payments.size === 2
    && replayedPayment.status === 200
    && replayedPayment.body.replayed === true;
  console.log(`${concurrentPaymentSafe ? 'PASS' : 'FAIL'} H08: concurrent receivable payments decrement atomically and retries are idempotent. balance=${receivableState.balance}, payments=${receivableState.payments.size}, replayed=${replayedPayment.body.replayed === true}`);
  if (!concurrentPaymentSafe) failures++;
  process.exitCode = failures ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 2; });
