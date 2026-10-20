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

  process.exitCode = failures ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 2; });
