/** Audit probes: executes real route code with in-memory dependencies only.
 * No database, network, application startup, or real sessions are used.
 * Exit 1 means the security invariant is currently violated.
 */
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
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
    URL,
    Buffer,
    process,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`);
      return dependencies[name];
    },
    console: { log() {}, info() {}, warn() {}, error() {} },
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
    '@/lib/session': {
      getCurrentStoreUser: async () => ({
        userId: 'owner-a',
        storeId: 'store-a',
        role: 'OWNER',
        email: 'owner@example.invalid',
        isLoggedIn: true,
      }),
    },
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
  const productDenied = purchase.status === 400
    && productOwnershipLookups === 1
    && !createdOrder;
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
    toString() { return String(this.value); }
    toNumber() { return this.value; }
    plus(other) { return new Decimal(this.value + Number(other)); }
    minus(other) { return new Decimal(this.value - Number(other)); }
    mul(other) { return new Decimal(this.value * Number(other)); }
    abs() { return new Decimal(Math.abs(this.value)); }
    isNegative() { return this.value < 0; }
    lte(other) { return this.value <= Number(other); }
    gt(other) { return this.value > Number(other); }
    gte(other) { return this.value >= Number(other); }
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
    '@/lib/session': {
      getCurrentStoreUser: async () => ({
        userId: 'owner-a',
        storeId: 'store-a',
        role: 'OWNER',
        email: 'owner@example.invalid',
        isLoggedIn: true,
      }),
      getSession: async () => ({ userId: 'owner-a', storeId: 'store-a' }),
    },
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

  const purchaseReceptionState = {
    order: {
      id: 'order-a', storeId: 'store-a', orderNumber: 12, status: 'SENT',
      updatedAt: new Date('2026-10-18T12:00:00.000Z'), receivedAt: null,
    },
    items: [
      { id: 'item-a', purchaseOrderId: 'order-a', storeProductId: 'product-a', quantityOrdered: new Decimal(3), quantityReceived: new Decimal(0), unitCost: new Decimal(2), batchNumber: null, expiryDate: null },
      { id: 'item-b', purchaseOrderId: 'order-a', storeProductId: 'product-b', quantityOrdered: new Decimal(2), quantityReceived: new Decimal(0), unitCost: new Decimal(5), batchNumber: null, expiryDate: null },
    ],
    products: new Map([
      ['product-a', { id: 'product-a', storeId: 'store-a', active: true, stock: 0, costPrice: 0 }],
      ['product-b', { id: 'product-b', storeId: 'store-a', active: true, stock: 0, costPrice: 0 }],
    ]),
    batches: new Map(),
    movements: new Map(),
    version: 0,
  };
  const cloneReceptionState = () => ({
    order: { ...purchaseReceptionState.order, updatedAt: new Date(purchaseReceptionState.order.updatedAt), receivedAt: purchaseReceptionState.order.receivedAt ? new Date(purchaseReceptionState.order.receivedAt) : null },
    items: purchaseReceptionState.items.map(item => ({ ...item, quantityOrdered: new Decimal(item.quantityOrdered), quantityReceived: new Decimal(item.quantityReceived), unitCost: new Decimal(item.unitCost), expiryDate: item.expiryDate ? new Date(item.expiryDate) : null })),
    products: new Map(Array.from(purchaseReceptionState.products, ([id, product]) => [id, { ...product, costPrice: new Decimal(product.costPrice) }])),
    batches: new Map(Array.from(purchaseReceptionState.batches, ([id, batch]) => [id, { ...batch, quantityInitial: new Decimal(batch.quantityInitial), quantityAvailable: new Decimal(batch.quantityAvailable), unitCost: new Decimal(batch.unitCost), expiryDate: new Date(batch.expiryDate) }])),
    movements: new Map(Array.from(purchaseReceptionState.movements, ([id, movement]) => [id, { ...movement, quantity: new Decimal(movement.quantity), unitPrice: new Decimal(movement.unitPrice), total: new Decimal(movement.total) }])),
    version: purchaseReceptionState.version,
  });
  const restoreReceptionState = snapshot => {
    purchaseReceptionState.order = snapshot.order;
    purchaseReceptionState.items = snapshot.items;
    purchaseReceptionState.products = snapshot.products;
    purchaseReceptionState.batches = snapshot.batches;
    purchaseReceptionState.movements = snapshot.movements;
    purchaseReceptionState.version = snapshot.version;
  };
  const receptionOrder = includeItems => ({
    ...purchaseReceptionState.order,
    ...(includeItems ? { items: purchaseReceptionState.items } : {}),
  });
  const purchaseReceptionDb = {
    purchaseOrder: {
      findFirst: async ({ where, include }) => where.id === purchaseReceptionState.order.id
        && where.storeId === purchaseReceptionState.order.storeId
        ? receptionOrder(Boolean(include?.items))
        : null,
    },
    movement: {
      findMany: async ({ where }) => Array.from(purchaseReceptionState.movements.values())
        .filter(movement => movement.storeId === where.storeId
          && movement.type === where.type
          && movement.notes.includes(where.notes.contains))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ id, storeProductId, quantity }) => ({ id, storeProductId, quantity })),
    },
    $transaction: async callback => {
      const before = cloneReceptionState();
      const tx = {
        purchaseOrder: {
          updateMany: async ({ where }) => {
            const expectedTime = new Date(where.updatedAt).getTime();
            if (where.id !== purchaseReceptionState.order.id
              || where.storeId !== purchaseReceptionState.order.storeId
              || purchaseReceptionState.order.updatedAt.getTime() !== expectedTime
              || !where.status.in.includes(purchaseReceptionState.order.status)) return { count: 0 };
            purchaseReceptionState.version += 1;
            purchaseReceptionState.order.updatedAt = new Date(expectedTime + purchaseReceptionState.version);
            return { count: 1 };
          },
          findFirst: async ({ where, include }) => where.id === purchaseReceptionState.order.id
            && where.storeId === purchaseReceptionState.order.storeId
            ? receptionOrder(Boolean(include?.items))
            : null,
          update: async ({ data }) => {
            purchaseReceptionState.order.status = data.status;
            if (data.receivedAt) purchaseReceptionState.order.receivedAt = data.receivedAt;
            return receptionOrder(false);
          },
        },
        storeProduct: {
          findMany: async ({ where }) => where.id.in
            .map(id => purchaseReceptionState.products.get(id))
            .filter(product => product && product.storeId === where.storeId && product.active === where.active)
            .map(product => ({ id: product.id })),
          update: async ({ where, data }) => {
            const product = purchaseReceptionState.products.get(where.id);
            product.stock += Number(data.stock.increment);
            product.costPrice = new Decimal(data.costPrice);
            return product;
          },
        },
        productBatch: {
          upsert: async ({ where, create, update }) => {
            const key = Object.values(where)[0];
            let batch = Array.from(purchaseReceptionState.batches.values()).find(candidate => (
              candidate.storeId === key.storeId
              && candidate.storeProductId === key.storeProductId
              && candidate.batchNumber === key.batchNumber
              && candidate.expiryDate.getTime() === new Date(key.expiryDate).getTime()
            ));
            if (!batch) {
              batch = { id: `batch-${purchaseReceptionState.batches.size + 1}`, ...create, quantityInitial: new Decimal(create.quantityInitial), quantityAvailable: new Decimal(create.quantityAvailable), unitCost: new Decimal(create.unitCost) };
              purchaseReceptionState.batches.set(batch.id, batch);
            } else {
              batch.quantityInitial = new Decimal(Number(batch.quantityInitial) + Number(update.quantityInitial.increment));
              batch.quantityAvailable = new Decimal(Number(batch.quantityAvailable) + Number(update.quantityAvailable.increment));
              batch.unitCost = new Decimal(update.unitCost);
              batch.active = update.active;
            }
            return batch;
          },
        },
        purchaseOrderItem: {
          update: async ({ where, data }) => {
            const item = purchaseReceptionState.items.find(candidate => candidate.id === where.id);
            item.quantityReceived = new Decimal(Number(item.quantityReceived) + Number(data.quantityReceived.increment));
            item.batchNumber = data.batchNumber;
            item.expiryDate = data.expiryDate;
            return item;
          },
          findMany: async () => purchaseReceptionState.items,
        },
        movement: {
          create: async ({ data }) => {
            if (purchaseReceptionState.movements.has(data.id)) {
              const error = new Error('Unique constraint');
              error.code = 'P2002';
              throw error;
            }
            purchaseReceptionState.movements.set(data.id, data);
            return data;
          },
        },
      };
      try {
        return await callback(tx);
      } catch (error) {
        restoreReceptionState(before);
        throw error;
      }
    },
  };
  const receptionRoute = loadRoute('src/app/api/purchase-orders/[id]/route.ts', {
    crypto: require('crypto'),
    'next/server': next,
    '@/lib/session': { getCurrentUser: async () => ({ userId: 'owner-a', storeId: 'store-a', role: 'OWNER' }) },
    '@/infra/db/prisma': { prisma: purchaseReceptionDb },
    '@/lib/featureFlags': { isFeatureEnabled: async () => true },
    '@prisma/client': {
      FeatureFlagKey: { ENABLE_SUPPLIERS: 'ENABLE_SUPPLIERS', ENABLE_BATCH_EXPIRY: 'ENABLE_BATCH_EXPIRY' },
      Prisma: { Decimal, TransactionIsolationLevel: { Serializable: 'Serializable' } },
    },
  });
  const receptionRequest = (key, receivedItems) => ({
    headers: { get: name => name.toLowerCase() === 'idempotency-key' ? key : null },
    json: async () => ({ action: 'receive', receivedItems }),
  });
  const receptionParams = { params: { id: 'order-a' } };
  const firstReceiptItems = [
    { itemId: 'item-a', quantityReceived: '1', batchNumber: 'LOT-A', expiryDate: '2027-05-01' },
    { itemId: 'item-b', quantityReceived: '1', batchNumber: '', expiryDate: '' },
  ];
  const firstReceipt = await receptionRoute.PATCH(
    receptionRequest('receipt-audit-key-1', firstReceiptItems), receptionParams
  );
  const replayedReceipt = await receptionRoute.PATCH(
    receptionRequest('receipt-audit-key-1', firstReceiptItems), receptionParams
  );
  const firstMovements = Array.from(purchaseReceptionState.movements.values())
    .sort((a, b) => a.storeProductId.localeCompare(b.storeProductId));
  const correctPerItemBatch = firstMovements.length === 2
    && firstMovements[0].storeProductId === 'product-a'
    && Boolean(firstMovements[0].batchId)
    && firstMovements[1].storeProductId === 'product-b'
    && firstMovements[1].batchId === null;
  const firstReceiptSafe = firstReceipt.status === 200
    && replayedReceipt.status === 200
    && replayedReceipt.body.replayed === true
    && purchaseReceptionState.products.get('product-a').stock === 1
    && purchaseReceptionState.products.get('product-b').stock === 1
    && correctPerItemBatch;
  console.log(`${firstReceiptSafe ? 'PASS' : 'FAIL'} H10: exact reception retries do not duplicate stock and each movement keeps its own batch. movements=${firstMovements.length}, replayed=${replayedReceipt.body.replayed === true}`);
  if (!firstReceiptSafe) failures++;

  const beforeConcurrentStock = purchaseReceptionState.products.get('product-a').stock;
  const concurrentReceipts = await Promise.all([
    receptionRoute.PATCH(receptionRequest('receipt-audit-key-2', [{ itemId: 'item-a', quantityReceived: '1', batchNumber: '', expiryDate: '' }]), receptionParams),
    receptionRoute.PATCH(receptionRequest('receipt-audit-key-3', [{ itemId: 'item-a', quantityReceived: '1', batchNumber: '', expiryDate: '' }]), receptionParams),
  ]);
  const concurrentReceiptSafe = concurrentReceipts.filter(response => response.status === 200).length === 1
    && concurrentReceipts.filter(response => response.status === 409).length === 1
    && purchaseReceptionState.products.get('product-a').stock === beforeConcurrentStock + 1;
  console.log(`${concurrentReceiptSafe ? 'PASS' : 'FAIL'} H10: concurrent receptions cannot apply the same pending stock twice. statuses=${concurrentReceipts.map(response => response.status).join(',')}, stock=${purchaseReceptionState.products.get('product-a').stock}`);
  if (!concurrentReceiptSafe) failures++;

  const beforeOverReceipt = cloneReceptionState();
  const overReceipt = await receptionRoute.PATCH(
    receptionRequest('receipt-audit-key-4', [{ itemId: 'item-b', quantityReceived: '2', batchNumber: '', expiryDate: '' }]),
    receptionParams
  );
  const overReceiptDenied = overReceipt.status === 400
    && purchaseReceptionState.products.get('product-b').stock === beforeOverReceipt.products.get('product-b').stock
    && Number(purchaseReceptionState.items.find(item => item.id === 'item-b').quantityReceived) === Number(beforeOverReceipt.items.find(item => item.id === 'item-b').quantityReceived);
  console.log(`${overReceiptDenied ? 'PASS' : 'FAIL'} H10: over-reception is rejected without changing stock. status=${overReceipt.status}`);
  if (!overReceiptDenied) failures++;

  const { consumeSaleInventory, adjustStockAtomically } = loadRoute(
    'src/lib/inventory/stockMutations.ts',
    { '@prisma/client': { Prisma: { Decimal } } }
  );
  const inventoryState = {
    products: new Map([
      ['product-receipt', { id: 'product-receipt', storeId: 'store-a', active: true, stock: 10 }],
      ['product-race', { id: 'product-race', storeId: 'store-a', active: true, stock: 5 }],
      ['product-mixed', { id: 'product-mixed', storeId: 'store-a', active: true, stock: 5 }],
      ['product-untracked', { id: 'product-untracked', storeId: 'store-a', active: true, stock: null }],
    ]),
    batches: new Map([
      ['batch-a', { id: 'batch-a', storeId: 'store-a', storeProductId: 'product-receipt', active: true, quantityAvailable: 4 }],
    ]),
  };
  const matchesDecimalFilter = (value, filter) => {
    if (!filter) return true;
    if ('gte' in filter && (value === null || value < Number(filter.gte))) return false;
    if ('not' in filter && filter.not === null && value === null) return false;
    return true;
  };
  const inventoryTx = {
    storeProduct: {
      updateMany: async ({ where, data }) => {
        const product = inventoryState.products.get(where.id);
        if (!product
          || product.storeId !== where.storeId
          || product.active !== where.active
          || !matchesDecimalFilter(product.stock, where.stock)) return { count: 0 };
        if (data.stock.increment !== undefined) product.stock += Number(data.stock.increment);
        if (data.stock.decrement !== undefined) product.stock -= Number(data.stock.decrement);
        return { count: 1 };
      },
    },
    productBatch: {
      updateMany: async ({ where, data }) => {
        const batch = inventoryState.batches.get(where.id);
        if (!batch
          || batch.storeId !== where.storeId
          || batch.storeProductId !== where.storeProductId
          || batch.active !== where.active
          || !matchesDecimalFilter(batch.quantityAvailable, where.quantityAvailable)) return { count: 0 };
        batch.quantityAvailable -= Number(data.quantityAvailable.decrement);
        return { count: 1 };
      },
    },
  };
  const saleInput = (storeProductId, quantity, extra = {}) => ({
    storeId: 'store-a',
    products: [{ storeProductId, productName: storeProductId, quantity, tracksStock: true }],
    batches: [],
    ...extra,
  });

  // Una recepción posterior a la lectura inicial no puede perderse por una asignación absoluta.
  inventoryState.products.get('product-receipt').stock += 5;
  await consumeSaleInventory(inventoryTx, saleInput('product-receipt', 3));
  const receiptPreserved = inventoryState.products.get('product-receipt').stock === 12;
  console.log(`${receiptPreserved ? 'PASS' : 'FAIL'} H14: sale decrement preserves a concurrent receipt increment. stock=${inventoryState.products.get('product-receipt').stock}`);
  if (!receiptPreserved) failures++;

  const concurrentSales = await Promise.allSettled([
    consumeSaleInventory(inventoryTx, saleInput('product-race', 4)),
    consumeSaleInventory(inventoryTx, saleInput('product-race', 4)),
  ]);
  const concurrentSaleSafe = concurrentSales.filter(result => result.status === 'fulfilled').length === 1
    && concurrentSales.filter(result => result.status === 'rejected').length === 1
    && inventoryState.products.get('product-race').stock === 1;
  console.log(`${concurrentSaleSafe ? 'PASS' : 'FAIL'} H14: two concurrent sales cannot overdraw the same stock. stock=${inventoryState.products.get('product-race').stock}`);
  if (!concurrentSaleSafe) failures++;

  await Promise.all([
    adjustStockAtomically(inventoryTx, { storeId: 'store-a', storeProductId: 'product-mixed', quantity: 3 }),
    consumeSaleInventory(inventoryTx, saleInput('product-mixed', 4)),
  ]);
  const mixedMutationSafe = inventoryState.products.get('product-mixed').stock === 4;
  console.log(`${mixedMutationSafe ? 'PASS' : 'FAIL'} H14: concurrent manual adjustment and sale preserve both deltas. stock=${inventoryState.products.get('product-mixed').stock}`);
  if (!mixedMutationSafe) failures++;

  let batchConflict;
  try {
    await consumeSaleInventory(inventoryTx, {
      storeId: 'store-a',
      products: [],
      batches: [{ storeProductId: 'product-receipt', batchId: 'batch-a', batchNumber: 'LOT-A', quantity: 5 }],
    });
  } catch (error) {
    batchConflict = error;
  }
  const batchGuarded = batchConflict?.code === 'INSUFFICIENT_BATCH_STOCK'
    && inventoryState.batches.get('batch-a').quantityAvailable === 4;
  console.log(`${batchGuarded ? 'PASS' : 'FAIL'} H14: a stale FEFO allocation cannot overdraw a batch.`);
  if (!batchGuarded) failures++;

  await consumeSaleInventory(inventoryTx, {
    storeId: 'store-a',
    products: [{ storeProductId: 'product-untracked', productName: 'untracked', quantity: 99, tracksStock: false }],
    batches: [],
  });
  const untrackedUntouched = inventoryState.products.get('product-untracked').stock === null;
  console.log(`${untrackedUntouched ? 'PASS' : 'FAIL'} H14: products without stock control remain unmodified.`);
  if (!untrackedUntouched) failures++;

  const stockRouteSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/api/store-products/[id]/stock/route.ts'),
    'utf8'
  );
  const checkoutInventorySource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/api/sales/checkout/route.ts'),
    'utf8'
  );
  const inventoryRoutesUseAtomicMutations = checkoutInventorySource.includes('await consumeSaleInventory(tx')
    && !checkoutInventorySource.includes('data: { stock: new Prisma.Decimal(newStock) }')
    && stockRouteSource.includes('await prisma.$transaction')
    && stockRouteSource.includes('await adjustStockAtomically(tx');
  console.log(`${inventoryRoutesUseAtomicMutations ? 'PASS' : 'FAIL'} H14: checkout and manual adjustments use guarded atomic mutations inside transactions.`);
  if (!inventoryRoutesUseAtomicMutations) failures++;

  let reportRole = 'CASHIER';
  let reportStoreId = 'store-a';
  const capturedReportQueries = [];
  const reportSql = (strings, ...values) => ({ strings: Array.from(strings), values });
  const reportSummaryRoute = loadRoute('src/app/api/reports/summary/route.ts', {
    'next/server': next,
    '@/lib/session': {
      getSession: async () => ({
        userId: 'cashier-a',
        storeId: reportStoreId,
        role: reportRole,
      }),
    },
    '@/infra/db/prisma': { prisma: {
      sale: {
        findMany: async args => {
          capturedReportQueries.push(args);
          return [{
            id: 'sale-a',
            total: 20,
            discountTotal: 5,
            couponDiscount: 1,
            paymentMethod: 'CASH',
            items: [{
              productName: 'Audit product',
              productContent: null,
              quantity: 1,
              subtotal: 20,
              promotionDiscount: 1,
              categoryPromoDiscount: 2,
              volumePromoDiscount: 3,
              nthPromoDiscount: 4,
            }],
          }];
        },
      },
      $queryRaw: async () => [],
      receivablePayment: { aggregate: async () => ({ _sum: { amount: 0 } }) },
      receivable: { aggregate: async () => ({ _sum: { balance: 0 } }) },
    } },
    '@prisma/client': {
      Prisma: { sql: reportSql, empty: reportSql`` },
    },
  });

  const cashierSummaryResponse = await reportSummaryRoute.GET({
    url: 'http://localhost/api/reports/summary?from=2026-10-01&to=2026-10-19',
  });
  const cashierWhere = capturedReportQueries[0]?.where;
  const cashierSummary = cashierSummaryResponse.body?.summary;
  const cashierReportIsolated = cashierSummaryResponse.status === 200
    && cashierWhere?.storeId === 'store-a'
    && cashierWhere?.userId === 'cashier-a'
    && cashierWhere?.total?.gt === 0
    && typeof cashierWhere?.createdAt?.gte?.toISOString === 'function'
    && typeof cashierWhere?.createdAt?.lte?.toISOString === 'function'
    && cashierSummary?.totalCategoryPromotions === 2
    && cashierSummary?.totalVolumePromotions === 3
    && cashierSummary?.totalNthPromotions === 4;
  console.log(`${cashierReportIsolated ? 'PASS' : 'FAIL'} H15: cashier summary and every promotion total share store, user, date, and active-sale filters.`);
  if (!cashierReportIsolated) failures++;

  reportRole = 'OWNER';
  const ownerSummaryResponse = await reportSummaryRoute.GET({
    url: 'http://localhost/api/reports/summary?from=2026-10-01&to=2026-10-19',
  });
  const ownerWhere = capturedReportQueries[1]?.where;
  const ownerReportStoreWide = ownerSummaryResponse.status === 200
    && ownerWhere?.storeId === 'store-a'
    && !Object.prototype.hasOwnProperty.call(ownerWhere, 'userId')
    && ownerWhere?.total?.gt === 0;
  console.log(`${ownerReportStoreWide ? 'PASS' : 'FAIL'} H15: OWNER summary remains store-wide while excluding cancelled sales.`);
  if (!ownerReportStoreWide) failures++;

  reportStoreId = null;
  const storelessSummaryResponse = await reportSummaryRoute.GET({
    url: 'http://localhost/api/reports/summary',
  });
  const storelessReportDenied = storelessSummaryResponse.status === 403
    && storelessSummaryResponse.body?.code === 'STORE_REQUIRED'
    && capturedReportQueries.length === 2;
  console.log(`${storelessReportDenied ? 'PASS' : 'FAIL'} H15: a session without an active store cannot run a global report.`);
  if (!storelessReportDenied) failures++;

  const { registerPharmacyTrace } = loadRoute('src/lib/sales/pharmacyTrace.ts', {
    '@prisma/client': {
      FeatureFlagKey: { ENABLE_CONTROLLED_BOOK: 'ENABLE_CONTROLLED_BOOK' },
      Prisma: {},
    },
  });
  const pharmacyState = {
    patientMedications: new Map(),
    controlledBookEntries: new Map(),
  };
  const pharmacyTx = {
    featureFlag: {
      findUnique: async ({ where }) => where.storeId_key.storeId === 'store-a'
        ? { enabled: true }
        : null,
    },
    patient: {
      findFirst: async ({ where }) => where.id === 'patient-a'
        && where.storeId === 'store-a'
        && where.active === true
        ? { id: 'patient-a', name: 'Audit Patient', dni: '12345678' }
        : null,
    },
    user: {
      findFirst: async ({ where }) => where.id === 'owner-a'
        && where.storeId === 'store-a'
        && where.active === true
        ? { id: 'owner-a', name: 'Audit Dispenser' }
        : null,
    },
    patientMedication: {
      createMany: async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const entry of data) {
          if (pharmacyState.patientMedications.has(entry.id)) {
            if (skipDuplicates) continue;
            throw new Error('duplicate patient medication');
          }
          pharmacyState.patientMedications.set(entry.id, entry);
          count++;
        }
        return { count };
      },
    },
    controlledBookEntry: {
      createMany: async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const entry of data) {
          if (pharmacyState.controlledBookEntries.has(entry.id)) {
            if (skipDuplicates) continue;
            throw new Error('duplicate controlled book entry');
          }
          pharmacyState.controlledBookEntries.set(entry.id, entry);
          count++;
        }
        return { count };
      },
    },
  };
  const validPharmacyTrace = {
    storeId: 'store-a',
    userId: 'owner-a',
    sale: {
      id: 'sale-a',
      saleNumber: 81,
      createdAt: new Date('2026-10-19T12:00:00.000Z'),
    },
    patientId: 'patient-a',
    prescribedBy: 'Audit Doctor',
    cmpNumber: 'CMP-AUDIT',
    consultReason: 'Audit only',
    productLines: [{
      saleItemId: 'sale-item-a',
      productName: 'Controlled Audit Product',
      genericName: 'Audit Generic',
      concentration: '1 mg',
      laboratory: 'Audit Laboratory',
      quantity: new Decimal(2),
      batchBreakdown: [{ batchNumber: 'LOT-AUDIT', qty: 2 }],
      requiresPrescription: true,
      prescriptionNumber: 'RX-AUDIT',
      observation: 'Audit observation',
    }],
  };

  let foreignPatientError;
  try {
    await registerPharmacyTrace(pharmacyTx, {
      ...validPharmacyTrace,
      patientId: 'patient-from-store-b',
    });
  } catch (error) {
    foreignPatientError = error;
  }
  const foreignPatientDenied = foreignPatientError?.code === 'PATIENT_NOT_FOUND'
    && pharmacyState.patientMedications.size === 0
    && pharmacyState.controlledBookEntries.size === 0;
  console.log(`${foreignPatientDenied ? 'PASS' : 'FAIL'} H11: pharmacy trace rejects a patient outside the sale store before writing history.`);
  if (!foreignPatientDenied) failures++;

  let missingPrescriptionError;
  try {
    await registerPharmacyTrace(pharmacyTx, {
      ...validPharmacyTrace,
      productLines: validPharmacyTrace.productLines.map(line => ({
        ...line,
        prescriptionNumber: ' ',
      })),
    });
  } catch (error) {
    missingPrescriptionError = error;
  }
  const missingPrescriptionDenied = missingPrescriptionError?.code === 'PRESCRIPTION_REQUIRED'
    && pharmacyState.patientMedications.size === 0
    && pharmacyState.controlledBookEntries.size === 0;
  console.log(`${missingPrescriptionDenied ? 'PASS' : 'FAIL'} H11: controlled products require a prescription before trace records are written.`);
  if (!missingPrescriptionDenied) failures++;

  const firstTrace = await registerPharmacyTrace(pharmacyTx, validPharmacyTrace);
  const replayedTrace = await registerPharmacyTrace(pharmacyTx, validPharmacyTrace);
  const medication = pharmacyState.patientMedications.get('patient-med:patient-a:sale-item-a');
  const controlledEntry = pharmacyState.controlledBookEntries.get('controlled:sale-item-a');
  const pharmacyTraceIdempotent = firstTrace.patientMedications === 1
    && firstTrace.controlledBookEntries === 1
    && replayedTrace.patientMedications === 0
    && replayedTrace.controlledBookEntries === 0
    && pharmacyState.patientMedications.size === 1
    && pharmacyState.controlledBookEntries.size === 1
    && medication?.saleId === 'sale-a'
    && Number(medication?.quantity) === 2
    && controlledEntry?.storeId === 'store-a'
    && controlledEntry?.patientId === 'patient-a'
    && controlledEntry?.dispensedById === 'owner-a'
    && controlledEntry?.batchNumber === 'LOT-AUDIT';
  console.log(`${pharmacyTraceIdempotent ? 'PASS' : 'FAIL'} H11: pharmacy history and controlled book entries use persisted sale items and deterministic idempotency keys.`);
  if (!pharmacyTraceIdempotent) failures++;

  const checkoutSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/api/sales/checkout/route.ts'),
    'utf8'
  );
  const posSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/pos/page.tsx'),
    'utf8'
  );
  const transactionStart = checkoutSource.indexOf('return await prisma.$transaction');
  const traceCall = checkoutSource.indexOf('await registerPharmacyTrace(tx');
  const movementCreation = checkoutSource.indexOf('// 7. Crear Movements');
  const transactionallyLinked = transactionStart >= 0
    && traceCall > transactionStart
    && movementCreation > traceCall
    && !posSource.includes("fetch('/api/patients/medication'");
  console.log(`${transactionallyLinked ? 'PASS' : 'FAIL'} H11: pharmacy trace is inside checkout transaction and the duplicate client fallback is absent.`);
  if (!transactionallyLinked) failures++;

  const sessionConfig = loadRoute('src/lib/sessionConfig.ts', {});
  let missingSecretRejected = false;
  let shortSecretRejected = false;
  try { sessionConfig.requireSessionSecret(undefined); } catch { missingSecretRejected = true; }
  try { sessionConfig.requireSessionSecret('short'); } catch { shortSecretRejected = true; }
  const validSecret = 's'.repeat(48);
  const validSecretAccepted = sessionConfig.requireSessionSecret(validSecret) === validSecret;

  const sessionSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/lib/session.ts'),
    'utf8'
  );
  const middlewareSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/middleware.ts'),
    'utf8'
  );
  const desktopMainSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'desktop/src/main.ts'),
    'utf8'
  );
  const desktopServerSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'desktop/src/server.ts'),
    'utf8'
  );
  const buildPreparationSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'desktop/scripts/prepare-build.js'),
    'utf8'
  );

  const publicDesktopEnv = require(path.resolve(
    __dirname,
    '..',
    'desktop/scripts/public-desktop-env.js'
  ));
  const desktopEnvSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'monterrial-h02-'));
  let desktopPackageEnvironmentIsPublicOnly = false;
  try {
    const nestedServer = path.join(desktopEnvSandbox, 'server');
    fs.mkdirSync(nestedServer, { recursive: true });
    fs.writeFileSync(path.join(nestedServer, '.env'), 'DATABASE_URL=private-placeholder\n');
    fs.writeFileSync(path.join(nestedServer, '.env.production'), 'SESSION_SECRET=private-placeholder\n');
    publicDesktopEnv.writePublicDesktopEnvironment({
      buildResourcesDir: desktopEnvSandbox,
      cloudUrl: 'https://cloud.example.invalid/api/',
    });
    const packagedEnvironmentFiles = publicDesktopEnv.findEnvironmentFiles(desktopEnvSandbox)
      .map(file => path.relative(desktopEnvSandbox, file));
    desktopPackageEnvironmentIsPublicOnly = packagedEnvironmentFiles.length === 1
      && packagedEnvironmentFiles[0] === '.env'
      && fs.readFileSync(path.join(desktopEnvSandbox, '.env'), 'utf8')
        === 'CLOUD_URL=https://cloud.example.invalid/api\n'
      && buildPreparationSource.includes('writePublicDesktopEnvironment({ buildResourcesDir: BUILD_RESOURCES, cloudUrl })');
  } finally {
    fs.rmSync(desktopEnvSandbox, { recursive: true, force: true });
  }
  console.log(`${desktopPackageEnvironmentIsPublicOnly ? 'PASS' : 'FAIL'} H02: desktop packaging removes inherited environment files and keeps only public CLOUD_URL.`);
  if (!desktopPackageEnvironmentIsPublicOnly) failures++;

  const noPublicFallback = missingSecretRejected
    && shortSecretRejected
    && validSecretAccepted
    && !sessionSource.includes('complex_password_at_least')
    && !middlewareSource.includes('complex_password_at_least')
    && sessionSource.includes('getSessionOptions()')
    && middlewareSource.includes('getSessionOptions()');
  console.log(`${noPublicFallback ? 'PASS' : 'FAIL'} H16: web sessions reject missing or short secrets and have no public fallback.`);
  if (!noPublicFallback) failures++;

  const desktopSecretIsPerInstall = desktopMainSource.includes('const hasValidDevelopmentSecret = isDev')
    && desktopMainSource.includes("path.join(USER_DATA_PATH, 'app-secrets.json')")
    && desktopMainSource.includes("fs.writeFileSync(secretsFile")
    && desktopServerSource.includes('const sessionSecret = process.env.SESSION_SECRET')
    && desktopServerSource.indexOf('env.SESSION_SECRET = sessionSecret')
      > desktopServerSource.indexOf('...envVars')
    && !buildPreparationSource.includes('SESSION_SECRET=');
  console.log(`${desktopSecretIsPerInstall ? 'PASS' : 'FAIL'} H16: packaged desktop preserves a persisted per-install session secret.`);
  if (!desktopSecretIsPerInstall) failures++;

  const originalDesktopInternalToken = process.env.DESKTOP_INTERNAL_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  const validDesktopInternalToken = 'd'.repeat(64);
  process.env.DESKTOP_INTERNAL_TOKEN = validDesktopInternalToken;

  const desktopInternalAuth = loadRoute('src/lib/desktopInternalAuth.ts', {
    crypto: { default: require('crypto') },
  });
  const internalRequest = (token, body = { type: 'unknown', data: {} }) => ({
    headers: {
      get: name => name === desktopInternalAuth.DESKTOP_INTERNAL_TOKEN_HEADER ? token : null,
    },
    json: async () => body,
  });
  const internalTokenIsSafe = desktopInternalAuth.hasValidDesktopInternalToken(
    internalRequest(validDesktopInternalToken)
  )
    && !desktopInternalAuth.hasValidDesktopInternalToken(internalRequest('true'))
    && !desktopInternalAuth.hasValidDesktopInternalToken(internalRequest('x'.repeat(64)));

  let licenseQueries = 0;
  const licenseRoute = loadRoute('src/app/api/desktop/license/route.ts', {
    'next/server': next,
    '@/infra/db/prisma': { prisma: {
      store: { findMany: async () => { licenseQueries++; return []; } },
      subscription: { findUnique: async () => null },
    } },
    '@/lib/desktopInternalAuth': desktopInternalAuth,
    '@/lib/subscriptionStatus': {
      computeEffectiveStatus: value => value,
      isStoreAllowedToOperate: () => true,
      getDaysUntilExpiration: () => 0,
    },
  });
  const deniedLicense = await licenseRoute.GET(internalRequest('true'));
  const allowedLicense = await licenseRoute.GET(internalRequest(validDesktopInternalToken));

  const syncRoute = loadRoute('src/app/api/sync/push/route.ts', {
    'next/server': next,
    '@/lib/desktopInternalAuth': desktopInternalAuth,
  });
  const deniedSync = await syncRoute.POST(internalRequest('true'));
  const allowedSync = await syncRoute.POST(internalRequest(validDesktopInternalToken));
  const internalEndpointsProtected = internalTokenIsSafe
    && deniedLicense.status === 401
    && allowedLicense.status === 200
    && licenseQueries === 1
    && deniedSync.status === 401
    && allowedSync.status === 200
    && allowedSync.body?.skipped === true;
  console.log(`${internalEndpointsProtected ? 'PASS' : 'FAIL'} H17: internal endpoints reject the spoofable boolean header and require the server token.`);
  if (!internalEndpointsProtected) {
    console.log(JSON.stringify({
      internalTokenIsSafe,
      deniedLicenseStatus: deniedLicense.status,
      allowedLicenseStatus: allowedLicense.status,
      licenseQueries,
      deniedSyncStatus: deniedSync.status,
      allowedSyncStatus: allowedSync.status,
      allowedSyncBody: allowedSync.body,
    }));
  }
  if (!internalEndpointsProtected) failures++;

  const desktopTaskQueueSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'desktop/src/taskQueue.ts'),
    'utf8'
  );
  const callersPropagateToken = desktopMainSource.includes('setLicenseServerUrl(serverUrl, savedState.internalToken)')
    && desktopMainSource.includes('initTaskQueue({ serverUrl, internalToken: savedState.internalToken })')
    && desktopMainSource.includes('setLicenseServerUrl(serverUrl, localServer.internalToken)')
    && desktopServerSource.includes('startCloudSyncPolling(url, monterrialDataDir, envVars, internalToken)')
    && desktopServerSource.includes("'x-desktop-internal-token': internalToken")
    && desktopTaskQueueSource.includes("'x-desktop-internal-token': this.config.internalToken")
    && desktopTaskQueueSource.includes('updateServerConnection(serverUrl: string, internalToken: string)');
  console.log(`${callersPropagateToken ? 'PASS' : 'FAIL'} H17: Electron propagates and rotates the internal token across startup and queue paths.`);
  if (!callersPropagateToken) failures++;

  let backupContextQueries = 0;
  const backupContextRoute = loadRoute('src/app/api/desktop/backup-context/route.ts', {
    'next/server': next,
    '@/infra/db/prisma': { prisma: {
      store: { findMany: async () => {
        backupContextQueries++;
        return [{ id: 'store-a', name: 'Store A', ruc: null, address: null, phone: null }];
      } },
    } },
    '@/lib/desktopInternalAuth': desktopInternalAuth,
  });
  const deniedBackupContext = await backupContextRoute.GET(internalRequest('true'));
  const allowedBackupContext = await backupContextRoute.GET(internalRequest(validDesktopInternalToken));
  const backupSchedulerSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'desktop/src/backupScheduler.ts'),
    'utf8'
  );
  const backupSettingsSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/settings/backups/page.tsx'),
    'utf8'
  );
  const backupProbeSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'scripts/test-backup-scheduler-isolated.cjs'),
    'utf8'
  );
  const backupPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  const scheduledBackupsAreObservable = deniedBackupContext.status === 401
    && allowedBackupContext.status === 200
    && allowedBackupContext.body?.stores?.length === 1
    && backupContextQueries === 1
    && !backupSchedulerSource.includes('/api/store/current')
    && backupSchedulerSource.includes('/api/desktop/backup-context')
    && backupSchedulerSource.includes("path.join(app.getPath('userData'), 'backup-status.json')")
    && backupSchedulerSource.includes('runScheduledBackupNow()')
    && backupSettingsSource.includes('Ultimo respaldo correcto')
    && backupSettingsSource.includes('Crear respaldo ahora')
    && backupProbeSource.includes('restartPersistenceVerified')
    && backupProbeSource.includes('visibleFailureVerified')
    && backupPackage.scripts['test:backups:isolated'] === 'node scripts/test-backup-scheduler-isolated.cjs';
  console.log(`${scheduledBackupsAreObservable ? 'PASS' : 'FAIL'} H03: scheduled backups cover active stores, persist status and expose failures.`);
  if (!scheduledBackupsAreObservable) failures++;

  let debugUser = null;
  let debugQueryMode = 'ok';
  let debugQueries = 0;
  const debugRoute = loadRoute('src/app/api/debug/catalog/route.ts', {
    'next/server': next,
    '@/lib/prisma': { prisma: {
      catalogSettings: { findMany: async () => {
        debugQueries++;
        if (debugQueryMode === 'throw') throw new Error('sensitive database detail');
        return [];
      } },
      storeProduct: { findMany: async () => { debugQueries++; return []; } },
    } },
    '@/lib/session': { getCurrentUser: async () => debugUser },
    '@/lib/superadmin': { isSuperAdmin: email => email === 'admin@example.invalid' },
  });
  process.env.NODE_ENV = 'production';
  const productionDebug = await debugRoute.GET();
  const productionQueries = debugQueries;
  process.env.NODE_ENV = 'development';
  const unauthenticatedDebug = await debugRoute.GET();
  debugUser = { role: 'SUPERADMIN', email: 'admin@example.invalid' };
  const authorizedDebug = await debugRoute.GET();
  debugQueryMode = 'throw';
  const failedDebug = await debugRoute.GET();
  const debugIsClosed = productionDebug.status === 404
    && productionQueries === 0
    && unauthenticatedDebug.status === 403
    && authorizedDebug.status === 200
    && failedDebug.status === 500
    && failedDebug.body?.error === 'Error interno'
    && !JSON.stringify(failedDebug.body).includes('sensitive database detail')
    && !Object.hasOwn(failedDebug.body || {}, 'stack');
  console.log(`${debugIsClosed ? 'PASS' : 'FAIL'} H17: catalog diagnostics are closed in production and do not expose exception details.`);
  if (!debugIsClosed) failures++;

  class TestDecimal {
    constructor(value) { this.value = Number(value); }
    toNumber() { return this.value; }
  }

  const shiftRows = [];
  let shiftSequence = 0;
  let advisoryTail = Promise.resolve();
  let advisoryCalls = 0;
  const zeroClosedRow = {
    id: 'shift-zero',
    storeId: 'store-a',
    openedById: 'cashier-a',
    closedById: 'cashier-a',
    openedAt: new Date('2026-10-20T10:00:00.000Z'),
    closedAt: new Date('2026-10-20T11:00:00.000Z'),
    openingCash: new TestDecimal(0),
    closingCash: new TestDecimal(0),
    expectedCash: new TestDecimal(0),
    difference: new TestDecimal(0),
    notes: null,
    openedBy: { id: 'cashier-a', name: 'Cashier A', email: 'cashier-a@example.invalid' },
    closedBy: { id: 'cashier-a', name: 'Cashier A', email: 'cashier-a@example.invalid' },
  };
  const shiftModel = {
    findFirst: async ({ where }) => shiftRows.find(row => row.storeId === where.storeId
      && row.openedById === where.openedById && row.closedAt === null) || null,
    create: async ({ data }) => {
      const row = {
        id: `shift-${++shiftSequence}`,
        ...data,
        closedById: null,
        closedAt: null,
        closingCash: null,
        expectedCash: null,
        difference: null,
        notes: null,
      };
      shiftRows.push(row);
      return row;
    },
    update: async ({ data }) => ({ ...zeroClosedRow, ...data }),
    findMany: async () => [zeroClosedRow],
    count: async () => 1,
  };
  const shiftPrisma = {
    shift: shiftModel,
    $transaction: async callback => {
      let releaseAdvisoryLock;
      const tx = {
        shift: shiftModel,
        $executeRaw: async () => {
          advisoryCalls++;
          const previous = advisoryTail;
          advisoryTail = new Promise(resolve => { releaseAdvisoryLock = resolve; });
          await previous;
          return 1;
        },
      };
      try {
        return await callback(tx);
      } finally {
        if (releaseAdvisoryLock) releaseAdvisoryLock();
      }
    },
  };
  const shiftRepositoryModule = loadRoute('src/infra/db/repositories/PrismaShiftRepository.ts', {
    '@prisma/client': { Prisma: { Decimal: TestDecimal } },
    '@/infra/db/prisma': { prisma: shiftPrisma },
    '@/repositories/IShiftRepository': {},
    '@/domain/types': {},
  });
  const shiftRoute = loadRoute('src/app/api/shifts/open/route.ts', {
    'next/server': next,
    'iron-session': { getIronSession: async () => ({
      isLoggedIn: true,
      storeId: 'store-a',
      userId: 'cashier-a',
      role: 'CASHIER',
    }) },
    '@/lib/session': {},
    '@/lib/sessionConfig': { getSessionOptions: () => ({}) },
    'next/headers': { cookies: async () => ({}) },
    '@/infra/db/repositories/PrismaShiftRepository': shiftRepositoryModule,
    '@/lib/auditLog': {
      logAudit: async () => {},
      getRequestMetadata: () => ({ ip: '127.0.0.1', userAgent: 'audit' }),
    },
    '@/lib/rateLimit': { checkRateLimit: () => ({ allowed: true }) },
  });
  const openRequest = () => ({ json: async () => ({ openingCash: 0 }) });
  const concurrentOpenResults = await Promise.all([
    shiftRoute.POST(openRequest()),
    shiftRoute.POST(openRequest()),
  ]);
  const openStatuses = concurrentOpenResults.map(result => result.status).sort((a, b) => a - b);
  const concurrentOpenIsAtomic = openStatuses.join(',') === '201,409'
    && shiftRows.length === 1
    && shiftRows[0].openingCash.toNumber() === 0
    && advisoryCalls === 2;
  console.log(`${concurrentOpenIsAtomic ? 'PASS' : 'FAIL'} H18: concurrent requests create one open shift and preserve zero opening cash.`);
  if (!concurrentOpenIsAtomic) failures++;

  const shiftRepository = new shiftRepositoryModule.PrismaShiftRepository();
  const closedAtZero = await shiftRepository.close(
    'shift-zero',
    'cashier-a',
    { closingCash: 0 },
    0,
    0
  );
  const zeroHistory = await shiftRepository.getHistory('store-a', null);
  const zeroValuesArePreserved = closedAtZero.closingCash === 0
    && closedAtZero.expectedCash === 0
    && closedAtZero.difference === 0
    && zeroHistory.shifts[0].closingCash === 0
    && zeroHistory.shifts[0].expectedCash === 0
    && zeroHistory.shifts[0].difference === 0;
  console.log(`${zeroValuesArePreserved ? 'PASS' : 'FAIL'} H18: exact cash close and history keep monetary zero values instead of null.`);
  if (!zeroValuesArePreserved) failures++;

  const navigationPolicy = loadRoute('desktop/src/security/navigationPolicy.ts', {});
  const runningServerUrl = 'http://127.0.0.1:43123';
  const legitimateDesktopNavigation = [
    `${runningServerUrl}/login`,
    `${runningServerUrl}/`,
    `${runningServerUrl}/receipt/sale-a`,
  ].every(url => navigationPolicy.isAppServerUrl(url, runningServerUrl));
  const foreignOriginsAreRejected = [
    'http://127.0.0.1:43124/login',
    'http://localhost:43123/login',
    'http://127.0.0.1.evil.invalid:43123/login',
    'not a url',
  ].every(url => !navigationPolicy.isAppServerUrl(url, runningServerUrl));
  const popupPolicyIsExact = navigationPolicy.classifyWindowOpenUrl(
    `${runningServerUrl}/receipt/sale-a`, runningServerUrl
  ) === 'app'
    && navigationPolicy.classifyWindowOpenUrl('https://example.invalid/help', runningServerUrl) === 'external'
    && navigationPolicy.classifyWindowOpenUrl('mailto:support@example.invalid', runningServerUrl) === 'external'
    && navigationPolicy.classifyWindowOpenUrl('javascript:alert(1)', runningServerUrl) === 'blocked'
    && navigationPolicy.classifyWindowOpenUrl('file:///C:/Windows/System32', runningServerUrl) === 'blocked';
  const desktopUsesOriginPolicy = desktopMainSource.includes(
    "import { classifyWindowOpenUrl, isAppServerUrl } from './security/navigationPolicy'"
  )
    && desktopMainSource.includes('isAppServerUrl(navigationUrl, serverUrl)')
    && desktopMainSource.includes("if (disposition === 'app')")
    && desktopMainSource.includes("if (disposition === 'external')");
  const desktopNavigationIsConstrained = legitimateDesktopNavigation
    && foreignOriginsAreRejected
    && popupPolicyIsExact
    && desktopUsesOriginPolicy;
  console.log(`${desktopNavigationIsConstrained ? 'PASS' : 'FAIL'} H19: desktop navigation and ticket windows use the exact running server origin.`);
  if (!desktopNavigationIsConstrained) failures++;

  const printSecurity = loadRoute('print-service/src/security.ts', {
    crypto: require('crypto'),
  });
  const printServerSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'print-service/src/server.ts'),
    'utf8'
  );
  const printPosSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/pos/page.tsx'),
    'utf8'
  );
  const receiptSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/receipt/[id]/page.tsx'),
    'utf8'
  );
  let unsafePrintConfigRejected = false;
  try {
    printSecurity.validateConfigPatch({ usbPort: 'USB001; calc.exe' });
  } catch {
    unsafePrintConfigRejected = true;
  }
  const validPrintConfig = printSecurity.validateConfigPatch({
    mode: 'USB',
    usbPort: 'USB001',
    charsPerLine: 42,
    allowedOrigins: ['https://pos.example.invalid'],
  });
  const allowedCors = printSecurity.createCorsHeaders('https://pos.example.invalid');
  const printServiceIsRestricted = printSecurity.isAllowedOrigin('http://127.0.0.1:3000', [])
    && !printSecurity.isAllowedOrigin('http://127.0.0.1.evil.invalid:3000', [])
    && printSecurity.isAllowedOrigin(
      'https://pos.example.invalid',
      ['https://pos.example.invalid']
    )
    && !printSecurity.isAllowedOrigin('https://evil.invalid', ['https://pos.example.invalid'])
    && allowedCors['Access-Control-Allow-Origin'] === 'https://pos.example.invalid'
    && !Object.values(allowedCors).includes('*')
    && printSecurity.isAuthorizedToken('paired-token', 'paired-token')
    && !printSecurity.isAuthorizedToken('other-token', 'paired-token')
    && printSecurity.isSafePrinterPort('USB001')
    && !printSecurity.isSafePrinterPort('USB001;calc')
    && unsafePrintConfigRejected
    && validPrintConfig.usbPort === 'USB001'
    && validPrintConfig.charsPerLine === 42
    && !printServerSource.includes('cmd.exe')
    && printServerSource.includes("spawnSync('powershell.exe', [")
    && printServerSource.includes("server.listen(PORT, '127.0.0.1'")
    && printServerSource.includes("req.headers['x-marketpos-token']")
    && printPosSource.includes("'X-MarketPOS-Token': pairingToken")
    && receiptSource.includes("'X-MarketPOS-Token': pairingToken");
  console.log(`${printServiceIsRestricted ? 'PASS' : 'FAIL'} H12: print service restricts origins, authenticates mutations and avoids shell interpolation.`);
  if (!printServiceIsRestricted) failures++;

  const checkoutIdempotency = loadRoute('src/lib/sales/checkoutIdempotency.ts', {
    crypto: require('crypto'),
  });
  const checkoutRouteSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/api/sales/checkout/route.ts'),
    'utf8'
  );
  let invalidCheckoutKeyRejected = false;
  try {
    checkoutIdempotency.parseCheckoutIdempotencyKey('bad key');
  } catch {
    invalidCheckoutKeyRejected = true;
  }
  const canonicalHash = checkoutIdempotency.createCheckoutRequestHash({
    paymentMethod: 'CASH',
    items: [{ quantity: 1, productId: 'product-a' }],
  });
  const reorderedHash = checkoutIdempotency.createCheckoutRequestHash({
    items: [{ productId: 'product-a', quantity: 1 }],
    paymentMethod: 'CASH',
  });
  const changedHash = checkoutIdempotency.createCheckoutRequestHash({
    items: [{ productId: 'product-a', quantity: 2 }],
    paymentMethod: 'CASH',
  });
  const checkoutKey = checkoutIdempotency.parseCheckoutIdempotencyKey('checkout:stable-attempt');
  const checkoutId = checkoutIdempotency.createCheckoutSaleId('store-a', 'cashier-a', checkoutKey);
  const storeCheckIndex = checkoutRouteSource.indexOf('const store = await prisma.store.findUnique');
  const replayCheckIndex = checkoutRouteSource.indexOf('const persistedCheckout = await findPersistedCheckout');
  const rateLimitIndex = checkoutRouteSource.indexOf("const rateLimitResult = checkRateLimit('checkout'");
  const lockIndex = checkoutRouteSource.indexOf('lockAcquired = acquireCheckoutLock');
  const executeIndex = checkoutRouteSource.indexOf('result = await executeCheckout');
  const conflictStart = printPosSource.indexOf("data.code === 'CHECKOUT_IN_PROGRESS'");
  const conflictEnd = printPosSource.indexOf('if (!res.ok)', conflictStart);
  const conflictBranch = conflictStart >= 0 && conflictEnd > conflictStart
    ? printPosSource.slice(conflictStart, conflictEnd)
    : '';
  const checkoutRetriesAreDurable = invalidCheckoutKeyRejected
    && canonicalHash === reorderedHash
    && canonicalHash !== changedHash
    && checkoutId === checkoutIdempotency.createCheckoutSaleId('store-a', 'cashier-a', checkoutKey)
    && checkoutId !== checkoutIdempotency.createCheckoutSaleId('store-b', 'cashier-a', checkoutKey)
    && checkoutId !== checkoutIdempotency.createCheckoutSaleId('store-a', 'cashier-b', checkoutKey)
    && checkoutRouteSource.includes('id: checkoutSaleId')
    && checkoutRouteSource.includes('checkoutRequestHash: checkoutHash')
    && checkoutRouteSource.includes("error?.code === 'P2002'")
    && !checkoutRouteSource.includes('@/lib/idempotency')
    && storeCheckIndex >= 0
    && storeCheckIndex < replayCheckIndex
    && replayCheckIndex < rateLimitIndex
    && rateLimitIndex < lockIndex
    && lockIndex < executeIndex
    && printPosSource.includes('checkoutAttemptKeyRef')
    && printPosSource.includes("'Idempotency-Key': idempotencyKey")
    && !conflictBranch.includes('checkoutAttemptKeyRef.current = null');
  console.log(`${checkoutRetriesAreDurable ? 'PASS' : 'FAIL'} H13: checkout retries use a persistent tenant-scoped identity and stable client key.`);
  if (!checkoutRetriesAreDurable) failures++;

  const releaseTools = require('../desktop/scripts/release-metadata');
  const rootPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  const desktopPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'desktop/package.json'), 'utf8'));
  const migrationRunnerSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'desktop/src/updater/runMigrations.ts'),
    'utf8'
  );
  const migrationsDir = path.resolve(__dirname, '..', 'prisma/migrations');
  const timestampedMigrations = fs.readdirSync(migrationsDir)
    .filter(name => /^\d{14}_/.test(name) && fs.statSync(path.join(migrationsDir, name)).isDirectory());
  const baselineSql = timestampedMigrations.length === 1
    ? fs.readFileSync(path.join(migrationsDir, timestampedMigrations[0], 'migration.sql'), 'utf8')
    : '';
  const migrationProbe = fs.readFileSync(
    path.resolve(__dirname, '..', 'scripts/test-migrations-isolated.cjs'),
    'utf8'
  );
  const migrationPolicySafe = rootPackage.scripts.build === 'npm run build:only'
    && timestampedMigrations.length === 1
    && baselineSql.length > 10000
    && baselineSql.includes('CREATE TABLE "stores"')
    && baselineSql.includes('CREATE TABLE "sales"')
    && !migrationRunnerSource.includes('execPrismaDbPush')
    && !migrationRunnerSource.includes("'--accept-data-loss'")
    && !migrationRunnerSource.includes('await this.runSchemaPatch(databaseUrl)')
    && migrationRunnerSource.includes('assertLegacySchemaMatches')
    && migrationRunnerSource.includes("'--from-schema-datasource'")
    && migrationRunnerSource.includes("'--exit-code'")
    && migrationRunnerSource.includes('execPrismaMigrateResolve')
    && migrationProbe.includes("['h04_clean', 'h04_legacy', 'h04_drift']")
    && rootPackage.scripts['test:migrations:isolated'] === 'node scripts/test-migrations-isolated.cjs';
  console.log(`${migrationPolicySafe ? 'PASS' : 'FAIL'} H04: schema changes use a complete baseline and verified legacy adoption without db push.`);
  if (!migrationPolicySafe) failures++;
  const updaterSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'desktop/src/updater/autoUpdater.ts'),
    'utf8'
  );
  const preloadSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'desktop/src/preload.ts'),
    'utf8'
  );
  const releaseDocs = fs.readFileSync(
    path.resolve(__dirname, '..', 'docs/DESKTOP_RELEASE.md'),
    'utf8'
  );
  const trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);

  let unsafeOriginsRejected = false;
  try {
    const validOrigin = releaseTools.validateUpdateFeedUrl('https://updates.example.invalid/pos/');
    const unsafeOrigins = [
      'http://updates.example.invalid/pos',
      'https://user:secret@updates.example.invalid/pos',
      'https://updates.example.invalid/pos#override',
    ];
    unsafeOriginsRejected = validOrigin === 'https://updates.example.invalid/pos'
      && unsafeOrigins.every(origin => {
        try {
          releaseTools.validateUpdateFeedUrl(origin);
          return false;
        } catch {
          return true;
        }
      });
  } catch {
    unsafeOriginsRejected = false;
  }

  const packagePolicyIsTraceable = releaseTools.SEMVER_PATTERN.test(rootPackage.version)
    && rootPackage.version !== '0.1.0'
    && desktopPackage.version === rootPackage.version
    && rootPackage.scripts['electron:dev'] === 'npm run desktop:dev'
    && rootPackage.scripts['electron:build'] === 'npm run desktop:build'
    && rootPackage.scripts['electron:pack'] === 'npm run desktop:portable'
    && !desktopPackage.build.publish
    && desktopPackage.build.extraResources.some(resource => resource.to === 'release-manifest.json');
  const updaterOriginIsImmutable = updaterSource.includes("path.join(process.resourcesPath, 'release-manifest.json')")
    && updaterSource.includes("parsed.protocol !== 'https:'")
    && updaterSource.includes('if (!this.trustedUpdateOrigin)')
    && !updaterSource.includes('feedUrl')
    && !preloadSource.includes('feedUrl');
  const privateCertificatesAreUntracked = !trackedFiles.some(file => /\.(pfx|p12|pem|key)$/i.test(file));
  const releasePolicyDocumented = releaseDocs.includes('artifact-manifest.json')
    && releaseDocs.includes('npm run build:only')
    && !releaseDocs.includes('your-org')
    && !releaseDocs.includes('certificatePassword');
  const releasePolicySafe = unsafeOriginsRejected
    && packagePolicyIsTraceable
    && updaterOriginIsImmutable
    && privateCertificatesAreUntracked
    && releasePolicyDocumented;
  console.log(`${releasePolicySafe ? 'PASS' : 'FAIL'} H20: release versions, update origin and private-certificate policy are controlled.`);
  if (!releasePolicySafe) failures++;

  const artifactSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'monterrial-release-audit-'));
  try {
    const buildResourcesDir = path.join(artifactSandbox, 'build-resources');
    const outputDir = path.join(artifactSandbox, 'output');
    const unpackedDir = path.join(outputDir, 'win-unpacked');
    fs.mkdirSync(buildResourcesDir, { recursive: true });
    fs.mkdirSync(unpackedDir, { recursive: true });
    const releaseMetadata = releaseTools.createReleaseMetadata({
      rootDir: path.resolve(__dirname, '..'),
      desktopDir: path.resolve(__dirname, '..', 'desktop'),
      now: new Date('2026-10-20T12:00:00.000Z'),
    });
    fs.writeFileSync(
      path.join(buildResourcesDir, 'release-manifest.json'),
      JSON.stringify(releaseMetadata)
    );
    const fakeArtifact = path.join(unpackedDir, 'Monterrial POS SUNAT Beta.exe');
    fs.writeFileSync(fakeArtifact, 'isolated release artifact');
    const artifactManifest = releaseTools.writeArtifactManifest({ outputDir, buildResourcesDir });
    const expectedHash = crypto.createHash('sha256')
      .update(fs.readFileSync(fakeArtifact))
      .digest('hex');
    const generatedArtifactIsTraceable = releaseMetadata.version === rootPackage.version
      && releaseMetadata.buildId.startsWith(`${rootPackage.version}+`)
      && releaseMetadata.sourceCommit.length >= 12
      && artifactManifest.release.buildId === releaseMetadata.buildId
      && artifactManifest.artifacts.length === 1
      && artifactManifest.artifacts[0].sha256 === expectedHash
      && artifactManifest.artifacts[0].path === 'win-unpacked/Monterrial POS SUNAT Beta.exe';
    console.log(`${generatedArtifactIsTraceable ? 'PASS' : 'FAIL'} H20: artifact manifest records build identity, size and SHA-256.`);
    if (!generatedArtifactIsTraceable) failures++;
  } finally {
    fs.rmSync(artifactSandbox, { recursive: true, force: true });
  }

  if (originalDesktopInternalToken === undefined) delete process.env.DESKTOP_INTERNAL_TOKEN;
  else process.env.DESKTOP_INTERNAL_TOKEN = originalDesktopInternalToken;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  process.exitCode = failures ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 2; });
