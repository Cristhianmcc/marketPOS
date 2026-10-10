const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');
const AdmZip = require('adm-zip');

const repo = path.resolve(__dirname, '..');
const backupPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!backupPath || !fs.existsSync(backupPath)) {
  throw new Error('Uso: node scripts/test-backup-restore-isolated.cjs <respaldo.zip>');
}
process.env.SUPERADMIN_EMAILS = 'restore-test@example.invalid';

function compile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = module.paths;
  mod._compile(js, file);
  return mod.exports;
}

const fiscalModule = compile(`${repo}/src/lib/sunat/fiscalArchive.ts`);
const state = {
  store: null, settings: null, users: [], productMasters: [], storeProducts: [], customers: [],
  shifts: [], sales: [], saleItems: [], movements: [], receivables: [], payments: [], documents: [],
};
let sequence = 1;
const id = prefix => `${prefix}-${sequence++}`;
const create = (bucket, prefix) => async ({ data }) => {
  const row = { id: id(prefix), ...data };
  state[bucket].push(row);
  return row;
};
const tx = {
  store: { create: async ({ data }) => (state.store = { id: id('store'), ...data }) },
  storeSettings: { create: async ({ data }) => data },
  productMaster: {
    findUnique: async ({ where }) => {
      if (Object.prototype.hasOwnProperty.call(where, 'barcode')) {
        return state.productMasters.find(product => product.barcode === where.barcode) || null;
      }
      return state.productMasters.find(product => product.internalSku === where.internalSku) || null;
    },
    create: create('productMasters', 'pm'),
  },
  user: {
    findUnique: async ({ where }) => state.users.find(u => u.email === where.email) || null,
    create: create('users', 'user'),
  },
  storeProduct: { create: create('storeProducts', 'sp') },
  customer: { create: create('customers', 'customer') },
  shift: { create: create('shifts', 'shift') },
  sale: {
    create: create('sales', 'sale'),
    findMany: async ({ where }) => state.sales.filter(s => where.saleNumber.in.includes(s.saleNumber)).map(s => ({ id: s.id, saleNumber: s.saleNumber })),
  },
  saleItem: { create: create('saleItems', 'item') },
  movement: { create: create('movements', 'movement') },
  receivable: { create: create('receivables', 'receivable') },
  receivablePayment: { create: create('payments', 'payment') },
  sunatSettings: {
    findUnique: async () => state.settings,
    upsert: async ({ create: insert, update }) => (state.settings = state.settings ? { ...state.settings, ...update } : { id: id('sunat'), ...insert }),
  },
  electronicDocument: {
    findUnique: async ({ where }) => {
      const key = where.storeId_docType_series_number;
      return state.documents.find(d => d.storeId === key.storeId && d.docType === key.docType && d.series === key.series && d.number === key.number) || null;
    },
    create: create('documents', 'document'),
    update: async ({ where, data }) => {
      const index = state.documents.findIndex(d => d.id === where.id);
      if (index < 0) throw new Error('electronic document missing');
      state.documents[index] = { ...state.documents[index], ...data };
      return state.documents[index];
    },
  },
};
const prisma = {
  $transaction: async (callback, options) => {
    assert(options?.timeout >= 60_000, 'restore transaction timeout is too short');
    return callback(tx);
  },
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ status: init.status || 200, json: async () => body }) } };
  if (request === '@/lib/session') return { getSession: async () => ({ userId: 'superadmin-test', email: 'restore-test@example.invalid', role: 'SUPERADMIN', storeId: null }) };
  if (request === '@/infra/db/prisma') return { prisma };
  if (request === 'bcryptjs') return { hash: async () => 'isolated-password-hash' };
  if (request === 'adm-zip') return AdmZip;
  if (request === '@/lib/auditLog') return { logAudit: async () => undefined, getRequestMetadata: () => ({ ip: '127.0.0.1', userAgent: 'isolated-test' }) };
  if (request === '@/lib/rateLimit') return { checkRateLimit: () => ({ allowed: true, resetAt: Date.now() + 60000 }), getClientIP: () => '127.0.0.1' };
  if (request === '@/lib/sunat/fiscalArchive') return fiscalModule;
  return originalLoad.call(this, request, parent, isMain);
};

function assert(value, message) { if (!value) throw new Error(message); }

(async () => {
  const route = compile(`${repo}/src/app/api/backups/restore/new-store/route.ts`);
  const raw = fs.readFileSync(backupPath);
  const archive = new AdmZip(raw);
  const backupData = JSON.parse(archive.readAsText('data.json'));
  const productWithBarcode = backupData.productMasters.find(product => product.barcode);
  assert(productWithBarcode, 'backup needs a product with barcode for catalog reuse test');
  state.productMasters.push({
    ...productWithBarcode,
    id: 'preexisting-product',
    barcode: `existing-${productWithBarcode.id}`,
  });
  const fakeFile = { name: path.basename(backupPath), size: raw.length, arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
  const request = { formData: async () => ({ get: key => key === 'backup' ? fakeFile : null }), headers: { get: () => null } };
  const response = await route.POST(request);
  const body = await response.json();
  assert(response.status === 200 && body.success, `endpoint failed: ${body.message || response.status}`);
  assert(state.store.status === 'ARCHIVED', 'restored store is not archived');
  assert(state.settings.enabled === false && state.settings.env === 'BETA', 'SUNAT was not disabled after restore');
  const expected = JSON.parse(archive.readAsText('metadata.json')).counts;
  const expectedFiscalDocuments = backupData.fiscalArchive?.data?.documents?.length || 0;
  assert(state.productMasters.length === expected.productMasters, 'product master count mismatch');
  assert(state.storeProducts.length === expected.storeProducts, 'store product count mismatch');
  assert(state.sales.length === expected.sales, 'sales count mismatch');
  assert(state.saleItems.length === expected.saleItems, 'sale item count mismatch');
  assert(state.movements.length === expected.movements, 'movement count mismatch');
  assert(state.customers.length === expected.customers, 'customer count mismatch');
  assert(state.receivables.length === expected.receivables, 'receivable count mismatch');
  assert(state.payments.length === expected.receivablePayments, 'receivable payment count mismatch');
  assert(state.documents.length === expectedFiscalDocuments, 'fiscal document count mismatch');
  assert(new Set(state.documents.map(d => `${d.docType}|${d.series}|${d.number}`)).size === state.documents.length, 'duplicate fiscal documents');
  assert(body.restoredCounts.storeProducts === expected.storeProducts, 'response counts are not actual counts');
  console.log(JSON.stringify({
    result: 'PASS',
    responseStatus: response.status,
    restoredAsArchived: state.store.status === 'ARCHIVED',
    products: state.storeProducts.length,
    sales: state.sales.length,
    saleItems: state.saleItems.length,
    movements: state.movements.length,
    customers: state.customers.length,
    receivables: state.receivables.length,
    fiscalDocuments: state.documents.length,
    sunatDisabled: state.settings.enabled === false,
    transactionCompleted: true,
  }, null, 2));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
