/**
 * Prueba de ida y vuelta del respaldo por tienda contra PostgreSQL real.
 *
 * Levanta el PostgreSQL incluido en una carpeta temporal con dos bases
 * (origen y destino), siembra en origen una tienda con datos de todos los
 * módulos, ejecuta el handler real de exportación, restaura el ZIP con el
 * handler real en la base destino y compara tabla por tabla. No usa la base
 * del usuario ni Supabase.
 *
 * Uso: npx tsx scripts/test-backup-roundtrip-isolated.ts [--write-legacy-fixture]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Prisma, PrismaClient } from '@prisma/client';

const root = path.resolve(__dirname, '..');
const pgBin = path.join(root, 'desktop', 'vendor', 'postgres', 'bin');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const legacyFixture = path.join(root, 'scripts', 'fixtures', 'backup-v1.0-sintetico.zip');
const INTERNAL_TOKEN = 'roundtrip-internal-token-with-more-than-32-characters';
const SUPERADMIN_EMAIL = 'restore-test@example.invalid';

function executable(name: string) {
  return path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
}

function run(command: string, args: string[], options: Parameters<typeof spawnSync>[2] = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 240_000,
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(' ')} failed (${result.status})\n${result.stdout || ''}${result.stderr || ''}`);
  }
  return String(result.stdout || '').trim();
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Workers: cada uno corre en su propio proceso para que el cliente Prisma
// singleton de la aplicación apunte a la base correcta.
// ──────────────────────────────────────────────────────────────────────────

function runWorker(mode: string, databaseUrl: string, args: string[]) {
  const result = spawnSync(process.execPath, [tsxCli, __filename, `--mode=${mode}`, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
    windowsHide: true,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      DESKTOP_INTERNAL_TOKEN: INTERNAL_TOKEN,
      SUPERADMIN_EMAILS: SUPERADMIN_EMAIL,
      NODE_ENV: 'test',
    },
  });
  if (result.error) throw result.error;
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0) throw new Error(`Worker ${mode} failed (${result.status})\n${output}`);
  const line = String(result.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT:'));
  if (!line) throw new Error(`Worker ${mode} returned no result\n${output}`);
  return JSON.parse(line.slice('RESULT:'.length));
}

async function exportWorker(storeId: string, outPath: string) {
  const { NextRequest } = require('next/server');
  const { GET } = require('../src/app/api/backups/export/route');
  const request = new NextRequest(`http://127.0.0.1/api/backups/export?storeId=${storeId}`, {
    headers: { 'x-desktop-internal-token': INTERNAL_TOKEN },
  });
  const response = await GET(request);
  if (response.status !== 200) {
    throw new Error(`Export returned ${response.status}: ${await response.text()}`);
  }
  fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
  console.log(`RESULT:${JSON.stringify({ ok: true })}`);
}

async function restoreWorker(zipPath: string) {
  // La ruta real usa iron-session con cookies de Next. Aquí se sustituye el
  // módulo de sesión por una sesión SUPERADMIN fija antes de cargar la ruta.
  const sessionPath = require.resolve('../src/lib/session');
  const session = {
    userId: 'roundtrip-superadmin',
    email: SUPERADMIN_EMAIL,
    name: 'Roundtrip',
    role: 'SUPERADMIN',
    storeId: null,
    isLoggedIn: true,
  };
  require.cache[sessionPath] = {
    id: sessionPath,
    filename: sessionPath,
    loaded: true,
    exports: { getSession: async () => session },
  } as NodeJS.Module;

  const { NextRequest } = require('next/server');
  const { POST } = require('../src/app/api/backups/restore/new-store/route');
  const body = fs.readFileSync(zipPath);
  const request = new NextRequest('http://127.0.0.1/api/backups/restore/new-store', {
    method: 'POST',
    headers: {
      'content-type': 'application/zip',
      'content-length': String(body.length),
      'x-backup-filename': encodeURIComponent(path.basename(zipPath)),
    },
    body,
  });
  const response = await POST(request);
  const payload = await response.json();
  console.log(`RESULT:${JSON.stringify({ status: response.status, payload })}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Datos de prueba: una tienda que usa todos los módulos.
// ──────────────────────────────────────────────────────────────────────────

const UNITS = [
  { code: 'NIU', sunatCode: 'NIU', name: 'Unidad', kind: 'GOODS', allowDecimals: false },
  { code: 'KGM', sunatCode: 'KGM', name: 'Kilogramo', kind: 'GOODS', allowDecimals: true },
  { code: 'MTR', sunatCode: 'MTR', name: 'Metro', kind: 'GOODS', allowDecimals: true },
  { code: 'BX', sunatCode: 'BX', name: 'Caja', kind: 'GOODS', allowDecimals: false },
  { code: 'ZZ', sunatCode: 'ZZ', name: 'Servicio', kind: 'SERVICES', allowDecimals: false },
] as const;

async function seedUnits(db: PrismaClient, reverse = false) {
  const list = reverse ? [...UNITS].reverse() : [...UNITS];
  for (const unit of list) await db.unit.create({ data: { ...unit } });
}

async function seedStore(db: PrismaClient) {
  const unit = async (code: string) => (await db.unit.findUniqueOrThrow({ where: { code } })).id;
  const d = (iso: string) => new Date(iso);

  const store = await db.store.create({
    data: { name: 'Botica Roundtrip', ruc: '20123456789', address: 'Av. Prueba 123', phone: '999111222', businessProfile: 'FARMACIA' },
  });
  const storeId = store.id;

  await db.storeSettings.create({
    data: { storeId, ticketFooter: 'Gracias', taxRate: 18, fefoEnabled: true, expiryAlertDays: 45, defaultPaymentMethod: 'CASH' },
  });
  await db.subscription.create({
    data: {
      storeId, planCode: 'BUSINESS', status: 'ACTIVE', startAt: d('2026-09-01T05:00:00Z'),
      currentPeriodStart: d('2026-10-01T05:00:00Z'), currentPeriodEnd: d('2026-11-01T05:00:00Z'), priceAmount: 149,
    },
  });
  await db.featureFlag.createMany({
    data: (['ALLOW_FIADO', 'ENABLE_BATCH_EXPIRY', 'ENABLE_FEFO_SALES', 'ENABLE_CONVERSIONS', 'ENABLE_SERVICES', 'ENABLE_WORK_ORDERS', 'ENABLE_SUPPLIERS', 'ENABLE_PATIENTS', 'ENABLE_CONTROLLED_BOOK'] as const)
      .map((key) => ({ storeId, key, enabled: true })),
  });
  await db.operationalLimit.create({
    data: { storeId, maxDiscountPercent: 15, maxManualDiscountAmount: 20, maxSaleTotal: 5000, maxItemsPerSale: 80, maxReceivableBalance: 500 },
  });
  await db.catalogSettings.create({
    data: { storeId, enabled: true, storeName: 'Botica Roundtrip', storeSlug: 'botica-roundtrip', whatsappNumber: '51999111222', catalogStatus: 'PUBLISHED', catalogUrl: 'https://example.invalid/c/botica-roundtrip' },
  });

  const owner = await db.user.create({ data: { storeId, email: 'owner@roundtrip.test', name: 'Dueña Prueba', password: 'hash-no-exportable', role: 'OWNER' } });
  const cashier = await db.user.create({ data: { storeId, email: 'caja@roundtrip.test', name: 'Cajero Prueba', password: 'hash-no-exportable', role: 'CASHIER' } });

  const parentCategory = await db.category.create({ data: { storeId, name: 'Medicamentos', slug: 'medicamentos', color: '#EF4444', icon: '💊', sortOrder: 1 } });
  await db.category.create({ data: { storeId, name: 'Analgésicos', slug: 'analgesicos', parentId: parentCategory.id, sortOrder: 2 } });

  const paracetamol = await db.productMaster.create({
    data: {
      barcode: '7750000000011', internalSku: 'RT-PARA-500', name: 'Paracetamol 500mg', category: 'Analgésicos', unitType: 'UNIT',
      baseUnitId: await unit('NIU'), genericName: 'Paracetamol', concentration: '500 mg', pharmaceuticalForm: 'Tableta',
      laboratory: 'Lab Prueba', sanitaryRegistry: 'RS-0001', requiresPrescription: true, medicineCategory: 'Analgésico',
    },
  });
  const cable = await db.productMaster.create({
    data: { barcode: '7750000000028', internalSku: 'RT-CABLE-14', name: 'Cable THW 14', category: 'Electricidad', unitType: 'UNIT', baseUnitId: await unit('MTR') },
  });
  const cemento = await db.productMaster.create({
    data: { internalSku: 'RT-CEM-KG', name: 'Cemento a granel', category: 'Construcción', unitType: 'KG', baseUnitId: await unit('KGM') },
  });

  const spPara = await db.storeProduct.create({ data: { storeId, productId: paracetamol.id, price: 1.5, costPrice: 0.6, stock: 170, minStock: 20 } });
  const spCable = await db.storeProduct.create({ data: { storeId, productId: cable.id, price: 2.2, costPrice: 1.1, stock: 480.5 } });
  const spCem = await db.storeProduct.create({ data: { storeId, productId: cemento.id, price: 0.9, costPrice: 0.5, stock: 95.25 } });

  await db.unitConversion.create({
    data: { storeId, productMasterId: cable.id, fromUnitId: await unit('BX'), toUnitId: await unit('MTR'), factorToBase: 100, roundingMode: 'NONE' },
  });
  await db.sellUnitPrice.create({ data: { storeId, productMasterId: cable.id, sellUnitId: await unit('BX'), price: 200, notes: 'Rollo de 100 m' } });

  const lot1 = await db.productBatch.create({
    data: { storeId, storeProductId: spPara.id, batchNumber: 'L-001', expiryDate: d('2027-03-31T05:00:00Z'), purchaseDate: d('2026-10-01T05:00:00Z'), quantityInitial: 100, quantityAvailable: 70, unitCost: 0.6 },
  });
  await db.productBatch.create({
    data: { storeId, storeProductId: spPara.id, batchNumber: 'L-002', expiryDate: d('2027-09-30T05:00:00Z'), quantityInitial: 100, quantityAvailable: 100, unitCost: 0.62 },
  });

  const service = await db.service.create({ data: { storeId, name: 'Instalación eléctrica', price: 35, baseUnitId: await unit('ZZ') } });

  const supplier = await db.supplier.create({ data: { storeId, name: 'Droguería Prueba', ruc: '20999888777', contactName: 'Ana', phone: '988777666' } });
  const purchaseOrder = await db.purchaseOrder.create({
    data: {
      storeId, supplierId: supplier.id, createdById: owner.id, orderNumber: 1, status: 'RECEIVED', totalAmount: 170,
      receivedAt: d('2026-10-01T15:00:00Z'), createdAt: d('2026-09-30T15:00:00Z'),
    },
  });
  await db.purchaseOrderItem.createMany({
    data: [
      { purchaseOrderId: purchaseOrder.id, storeProductId: spPara.id, quantityOrdered: 100, quantityReceived: 100, unitCost: 0.6, batchNumber: 'L-001', expiryDate: d('2027-03-31T05:00:00Z') },
      { purchaseOrderId: purchaseOrder.id, storeProductId: spCable.id, quantityOrdered: 50, quantityReceived: 50, unitCost: 1.1 },
    ],
  });

  const customer = await db.customer.create({ data: { storeId, name: 'Cliente Fiado', phone: '977666555', dni: '45678912' } });
  const shift = await db.shift.create({
    data: {
      storeId, openedById: cashier.id, closedById: owner.id, openedAt: d('2026-10-20T13:00:00Z'), closedAt: d('2026-10-21T01:00:00Z'),
      openingCash: 0, closingCash: 80, expectedCash: 80, difference: 0,
    },
  });

  const salePharma = await db.sale.create({
    data: {
      storeId, userId: cashier.id, shiftId: shift.id, saleNumber: 1, subtotal: 38.14, tax: 6.86, total: 45, totalBeforeDiscount: 45,
      paymentMethod: 'MIXED', amountPaid: 50, changeAmount: 5, paymentDetails: { splits: [{ method: 'CASH', amount: 30 }, { method: 'YAPE', amount: 15 }] },
      createdAt: d('2026-10-20T15:00:00Z'),
    },
  });
  await db.saleItem.create({
    data: {
      saleId: salePharma.id, storeProductId: spPara.id, productName: 'Paracetamol 500mg', unitType: 'UNIT', quantity: 30, unitPrice: 1.5, costPrice: 0.6,
      subtotal: 45, totalLine: 45, unitSunatCode: 'NIU', batchBreakdown: [{ batchNumber: 'L-001', quantity: 30 }], genericName: 'Paracetamol', concentration: '500 mg',
    },
  });

  const saleService = await db.sale.create({
    data: {
      storeId, userId: owner.id, shiftId: shift.id, saleNumber: 2, subtotal: 66.1, tax: 11.9, total: 78, totalBeforeDiscount: 78,
      paymentMethod: 'CASH', amountPaid: 78, changeAmount: 0, createdAt: d('2026-10-20T18:00:00Z'),
    },
  });
  await db.saleItem.createMany({
    data: [
      { saleId: saleService.id, serviceId: service.id, isService: true, productName: 'Instalación eléctrica', unitType: 'UNIT', quantity: 1, unitPrice: 35, subtotal: 35, totalLine: 35, unitSunatCode: 'ZZ' },
      {
        saleId: saleService.id, storeProductId: spCable.id, productName: 'Cable THW 14', unitType: 'UNIT', quantity: 19.5, unitPrice: 2.2, subtotal: 43, totalLine: 43,
        unitCodeUsed: 'MTR', quantityOriginal: 19.5, quantityBase: 19.5, conversionFactorUsed: 1, pricingMode: 'BASE_UNIT',
      },
    ],
  });

  const saleFiado = await db.sale.create({
    data: {
      storeId, userId: cashier.id, shiftId: shift.id, customerId: customer.id, saleNumber: 3, subtotal: 3.81, tax: 0.69, total: 4.5,
      totalBeforeDiscount: 4.5, paymentMethod: 'FIADO', createdAt: d('2026-10-20T20:00:00Z'),
    },
  });
  await db.saleItem.create({
    data: { saleId: saleFiado.id, storeProductId: spCem.id, productName: 'Cemento a granel', unitType: 'KG', quantity: 5, unitPrice: 0.9, subtotal: 4.5, totalLine: 4.5 },
  });
  const receivable = await db.receivable.create({
    data: { storeId, customerId: customer.id, saleId: saleFiado.id, originalAmount: 4.5, balance: 2.5, status: 'OPEN', createdById: cashier.id, createdAt: d('2026-10-20T20:00:00Z') },
  });
  await db.receivablePayment.create({
    data: { storeId, receivableId: receivable.id, shiftId: shift.id, amount: 2, method: 'CASH', createdById: cashier.id, createdAt: d('2026-10-20T22:00:00Z') },
  });

  await db.movement.createMany({
    data: [
      { storeId, storeProductId: spPara.id, type: 'PURCHASE', quantity: 100, unitPrice: 0.6, total: 60, batchId: lot1.id, createdById: owner.id, createdAt: d('2026-10-01T15:00:00Z') },
      { storeId, storeProductId: spPara.id, type: 'SALE', quantity: -30, batchId: lot1.id, createdById: cashier.id, createdAt: d('2026-10-20T15:00:00Z') },
      { storeId, storeProductId: spCem.id, type: 'ADJUSTMENT', quantity: -4.75, notes: 'Merma', createdById: owner.id, createdAt: d('2026-10-19T15:00:00Z') },
    ],
  });

  const workOrder = await db.workOrder.create({
    data: { storeId, orderNumber: 1, customerId: customer.id, status: 'CLOSED', notes: 'Cableado cocina', subtotal: 78, total: 78, saleId: saleService.id, createdAt: d('2026-10-19T14:00:00Z') },
  });
  await db.workOrderItem.createMany({
    data: [
      { workOrderId: workOrder.id, type: 'SERVICE', serviceId: service.id, itemName: 'Instalación eléctrica', unitIdUsed: await unit('ZZ'), quantityBase: 1, unitPrice: 35, subtotal: 35 },
      { workOrderId: workOrder.id, type: 'PRODUCT', storeProductId: spCable.id, itemName: 'Cable THW 14', unitIdUsed: await unit('MTR'), quantityOriginal: 19.5, quantityBase: 19.5, conversionFactor: 1, unitPrice: 2.2, subtotal: 43 },
    ],
  });

  const patient = await db.patient.create({
    data: { storeId, dni: '12345678', name: 'Paciente Prueba', phone: '966555444', birthDate: d('1980-05-10T05:00:00Z'), allergies: 'Penicilina', conditions: 'Hipertensión' },
  });
  await db.patientMedication.create({
    data: { patientId: patient.id, saleId: salePharma.id, productName: 'Paracetamol 500mg', genericName: 'Paracetamol', concentration: '500 mg', quantity: 30, prescribedBy: 'Dr. Prueba', dosage: '1 c/8h', dispensedAt: d('2026-10-20T15:00:00Z') },
  });
  await db.controlledBookEntry.create({
    data: {
      storeId, saleId: salePharma.id, saleNumber: 1, saleDate: d('2026-10-20T15:00:00Z'), productName: 'Paracetamol 500mg', genericName: 'Paracetamol',
      concentration: '500 mg', laboratory: 'Lab Prueba', batchNumber: 'L-001', quantity: 30, prescriptionNumber: 'RX-0001', prescribedBy: 'Dr. Prueba',
      cmpNumber: 'CMP-123', patientId: patient.id, patientName: 'Paciente Prueba', patientDni: '12345678', dispensedById: cashier.id,
      dispensedByName: 'Cajero Prueba', createdAt: d('2026-10-20T15:00:00Z'),
    },
  });
  await db.drugInteractionLog.create({
    data: { storeId, saleId: salePharma.id, patientId: patient.id, drugA: 'Paracetamol', drugB: 'Warfarina', severity: 'MODERATE', description: 'Prueba', action: 'ACKNOWLEDGED', acknowledgedBy: 'Cajero Prueba', createdAt: d('2026-10-20T15:00:00Z') },
  });

  await db.promotion.create({ data: { storeId, type: 'PACK_PRICE', name: 'Pack cemento', productId: cemento.id, minQty: 10, packPrice: 8 } });
  await db.coupon.create({ data: { storeId, code: 'BIENVENIDA', type: 'PERCENT', value: 10, minTotal: 20, maxUses: 50, usesCount: 3 } });
  await db.categoryPromotion.create({ data: { storeId, name: 'Analgésicos -5%', category: 'Analgésicos', type: 'PERCENT', value: 5, maxDiscountPerItem: 2 } });
  await db.volumePromotion.create({ data: { storeId, name: '3 paracetamol', productId: paracetamol.id, type: 'FIXED_PRICE', requiredQty: 3, packPrice: 4 } });
  await db.nthPromotion.create({ data: { storeId, name: '2do cable -20%', productId: cable.id, type: 'NTH_PERCENT', nthQty: 2, percentOff: 20 } });

  return storeId;
}

// ──────────────────────────────────────────────────────────────────────────
// Comparación genérica guiada por el datamodel de Prisma.
// ──────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type KeyMaps = Map<string, Map<string, string>>;

/** Modelos de la tienda que el respaldo debe conservar, con su filtro. */
const COMPARED: Array<{ model: string; where: (storeId: string) => Row }> = [
  { model: 'StoreSettings', where: (s) => ({ storeId: s }) },
  { model: 'Subscription', where: (s) => ({ storeId: s }) },
  { model: 'FeatureFlag', where: (s) => ({ storeId: s }) },
  { model: 'OperationalLimit', where: (s) => ({ storeId: s }) },
  { model: 'CatalogSettings', where: (s) => ({ storeId: s }) },
  { model: 'User', where: (s) => ({ storeId: s }) },
  { model: 'Category', where: (s) => ({ storeId: s }) },
  { model: 'ProductMaster', where: (s) => ({ storeProducts: { some: { storeId: s } } }) },
  { model: 'StoreProduct', where: (s) => ({ storeId: s }) },
  { model: 'UnitConversion', where: (s) => ({ storeId: s }) },
  { model: 'SellUnitPrice', where: (s) => ({ storeId: s }) },
  { model: 'ProductBatch', where: (s) => ({ storeId: s }) },
  { model: 'Service', where: (s) => ({ storeId: s }) },
  { model: 'Supplier', where: (s) => ({ storeId: s }) },
  { model: 'PurchaseOrder', where: (s) => ({ storeId: s }) },
  { model: 'PurchaseOrderItem', where: (s) => ({ purchaseOrder: { storeId: s } }) },
  { model: 'Customer', where: (s) => ({ storeId: s }) },
  { model: 'Shift', where: (s) => ({ storeId: s }) },
  { model: 'Sale', where: (s) => ({ storeId: s }) },
  { model: 'SaleItem', where: (s) => ({ sale: { storeId: s } }) },
  { model: 'Movement', where: (s) => ({ storeId: s }) },
  { model: 'Receivable', where: (s) => ({ storeId: s }) },
  { model: 'ReceivablePayment', where: (s) => ({ storeId: s }) },
  { model: 'WorkOrder', where: (s) => ({ storeId: s }) },
  { model: 'WorkOrderItem', where: (s) => ({ workOrder: { storeId: s } }) },
  { model: 'Patient', where: (s) => ({ storeId: s }) },
  { model: 'PatientMedication', where: (s) => ({ patient: { storeId: s } }) },
  { model: 'ControlledBookEntry', where: (s) => ({ storeId: s }) },
  { model: 'DrugInteractionLog', where: (s) => ({ storeId: s }) },
  { model: 'Promotion', where: (s) => ({ storeId: s }) },
  { model: 'Coupon', where: (s) => ({ storeId: s }) },
  { model: 'CategoryPromotion', where: (s) => ({ storeId: s }) },
  { model: 'VolumePromotion', where: (s) => ({ storeId: s }) },
  { model: 'NthPromotion', where: (s) => ({ storeId: s }) },
];

/** Registros históricos cuya fecha de creación forma parte del dato. */
const HISTORICAL = new Set([
  'Shift', 'Sale', 'Movement', 'Receivable', 'ReceivablePayment', 'PurchaseOrder',
  'WorkOrder', 'ControlledBookEntry', 'DrugInteractionLog',
]);

/**
 * Diferencias esperadas por diseño de la restauración: correos únicos nuevos,
 * contraseñas temporales y catálogo público desactivado en la copia.
 */
const EXPECTED_DIFFERENCES: Record<string, string[]> = {
  User: ['email', 'password'],
  CatalogSettings: ['enabled', 'storeSlug', 'catalogStatus', 'catalogUrl', 'lastPublishedAt', 'lastSyncAt'],
  ProductMaster: ['createdByStoreId', 'approvedById', 'approvedAt', 'mergedIntoId'],
};

/** Clave natural de cada modelo referenciado, estable entre dos bases. */
const NATURAL_KEYS: Record<string, { include?: Row; key: (row: Row) => string }> = {
  Unit: { key: (r) => String(r.code) },
  ProductMaster: { key: (r) => String(r.internalSku) },
  StoreProduct: { include: { product: true }, key: (r) => String((r.product as Row).internalSku) },
  User: { key: (r) => `${r.role}:${r.name}` },
  Shift: { key: (r) => (r.openedAt as Date).toISOString() },
  Sale: { key: (r) => `#${r.saleNumber}` },
  Customer: { key: (r) => String(r.name) },
  ProductBatch: { key: (r) => String(r.batchNumber) },
  Supplier: { key: (r) => String(r.name) },
  PurchaseOrder: { key: (r) => `OC${r.orderNumber}` },
  Patient: { key: (r) => String(r.dni) },
  Service: { key: (r) => String(r.name) },
  WorkOrder: { key: (r) => `OT${r.orderNumber}` },
  Category: { key: (r) => String(r.slug) },
  Receivable: { include: { sale: true }, key: (r) => `fiado#${(r.sale as Row).saleNumber}` },
};

const delegate = (db: PrismaClient, model: string) =>
  (db as unknown as Record<string, { findMany: (args: Row) => Promise<Row[]> }>)[model[0].toLowerCase() + model.slice(1)];

async function buildKeyMaps(db: PrismaClient): Promise<KeyMaps> {
  const maps: KeyMaps = new Map();
  for (const [model, spec] of Object.entries(NATURAL_KEYS)) {
    const rows = await delegate(db, model).findMany(spec.include ? { include: spec.include } : {});
    maps.set(model, new Map(rows.map((row) => [String(row.id), spec.key(row)])));
  }
  return maps;
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return new Prisma.Decimal(value as Prisma.Decimal.Value).toString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function signature(model: string, row: Row, maps: KeyMaps): string {
  const meta = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  assert(meta, `Modelo desconocido ${model}`);
  const foreignKeys = new Map<string, string>();
  for (const field of meta.fields) {
    if (field.kind === 'object' && field.relationFromFields?.length) {
      for (const fk of field.relationFromFields) foreignKeys.set(fk, field.type);
    }
  }
  const ignored = new Set(['id', 'storeId', 'updatedAt', ...(EXPECTED_DIFFERENCES[model] || [])]);
  if (!HISTORICAL.has(model)) ignored.add('createdAt');

  const out: Row = {};
  for (const field of meta.fields) {
    if (field.kind === 'object' || ignored.has(field.name)) continue;
    const value = row[field.name];
    const target = foreignKeys.get(field.name);
    if (target && value !== null && value !== undefined) {
      const mapped = maps.get(target)?.get(String(value));
      out[field.name] = mapped ? `→${target}:${mapped}` : `→${target}:<sin-clave>`;
    } else {
      out[field.name] = normalize(value);
    }
  }
  return JSON.stringify(out);
}

async function compareStores(source: PrismaClient, sourceStoreId: string, target: PrismaClient, targetStoreId: string) {
  const [sourceMaps, targetMaps] = await Promise.all([buildKeyMaps(source), buildKeyMaps(target)]);
  const report: Array<{ model: string; source: number; target: number; missing: string[]; extra: string[] }> = [];

  for (const { model, where } of COMPARED) {
    const [sourceRows, targetRows] = await Promise.all([
      delegate(source, model).findMany({ where: where(sourceStoreId) }),
      delegate(target, model).findMany({ where: where(targetStoreId) }),
    ]);
    const remaining = targetRows.map((row) => signature(model, row, targetMaps));
    const missing: string[] = [];
    for (const row of sourceRows) {
      const sig = signature(model, row, sourceMaps);
      const index = remaining.indexOf(sig);
      if (index >= 0) remaining.splice(index, 1);
      else missing.push(sig);
    }
    report.push({ model, source: sourceRows.length, target: targetRows.length, missing, extra: remaining });
  }
  return report;
}

// ──────────────────────────────────────────────────────────────────────────
// Contenido del ZIP exportado (Fase 1).
// ──────────────────────────────────────────────────────────────────────────

/** Secciones de data.json y el modelo de origen con el que se cuentan. */
const EXPORT_SECTIONS: Array<{ section: string; model: string; where: (storeId: string) => Row }> = [
  { section: 'categories', model: 'Category', where: (s) => ({ storeId: s }) },
  { section: 'unitConversions', model: 'UnitConversion', where: (s) => ({ storeId: s }) },
  { section: 'sellUnitPrices', model: 'SellUnitPrice', where: (s) => ({ storeId: s }) },
  { section: 'productBatches', model: 'ProductBatch', where: (s) => ({ storeId: s }) },
  { section: 'services', model: 'Service', where: (s) => ({ storeId: s }) },
  { section: 'suppliers', model: 'Supplier', where: (s) => ({ storeId: s }) },
  { section: 'purchaseOrders', model: 'PurchaseOrder', where: (s) => ({ storeId: s }) },
  { section: 'workOrders', model: 'WorkOrder', where: (s) => ({ storeId: s }) },
  { section: 'patients', model: 'Patient', where: (s) => ({ storeId: s }) },
  { section: 'patientMedications', model: 'PatientMedication', where: (s) => ({ patient: { storeId: s } }) },
  { section: 'controlledBookEntries', model: 'ControlledBookEntry', where: (s) => ({ storeId: s }) },
  { section: 'drugInteractionLogs', model: 'DrugInteractionLog', where: (s) => ({ storeId: s }) },
  { section: 'promotions', model: 'Promotion', where: (s) => ({ storeId: s }) },
  { section: 'coupons', model: 'Coupon', where: (s) => ({ storeId: s }) },
  { section: 'categoryPromotions', model: 'CategoryPromotion', where: (s) => ({ storeId: s }) },
  { section: 'volumePromotions', model: 'VolumePromotion', where: (s) => ({ storeId: s }) },
  { section: 'nthPromotions', model: 'NthPromotion', where: (s) => ({ storeId: s }) },
];

/** Claves o valores que nunca deben aparecer en un respaldo. */
const FORBIDDEN_CONTENT = [
  /"password"\s*:/i,
  /hash-no-exportable/,
  /"sol(User|Pass|Password)"\s*:/i,
  /"cert(ificate)?(Pfx|Password|Pem|Base64)?"\s*:/i,
  /"privateKey"\s*:/i,
];

async function inspectExport(zipPath: string, source: PrismaClient, storeId: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AdmZip = require('adm-zip');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('node:crypto');
  const zip = new AdmZip(zipPath);
  const metadata = JSON.parse(zip.readAsText('metadata.json')) as { version: string; checksum: string; counts: Record<string, number> };
  const dataText = zip.readAsText('data.json') as string;
  const data = JSON.parse(dataText) as Record<string, unknown>;
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  check('versión 1.1', metadata.version === '1.1', `metadata.version=${metadata.version}`);
  const digest = crypto.createHash('sha256').update(dataText, 'utf8').digest('hex');
  check('checksum', metadata.checksum === `sha256:${digest}`, 'sha256 de data.json');

  for (const { section, model, where } of EXPORT_SECTIONS) {
    const expected = (await delegate(source, model).findMany({ where: where(storeId) })).length;
    const value = data[section];
    const actual = Array.isArray(value) ? value.length : -1;
    check(`sección ${section}`, expected > 0 && actual === expected, `origen=${expected} zip=${actual} metadata=${metadata.counts?.[section]}`);
    check(`conteo ${section}`, metadata.counts?.[section] === actual, `metadata=${metadata.counts?.[section]} zip=${actual}`);
  }

  const nested = (section: string, child: string) =>
    ((data[section] as Row[] | undefined) || []).reduce((sum, row) => sum + ((row[child] as unknown[]) || []).length, 0);
  check('ítems de compras', nested('purchaseOrders', 'items') === 2 && metadata.counts?.purchaseOrderItems === 2, `zip=${nested('purchaseOrders', 'items')}`);
  check('ítems de órdenes de trabajo', nested('workOrders', 'items') === 2 && metadata.counts?.workOrderItems === 2, `zip=${nested('workOrders', 'items')}`);
  check('límites operativos', !!data.operationalLimit && metadata.counts?.operationalLimits === 1, 'objeto único');
  check('catálogo público', !!data.catalogSettings && metadata.counts?.catalogSettings === 1, 'objeto único');

  const unitCodes = ((data.units as Row[] | undefined) || []).map((u) => String(u.code)).sort();
  check('unidades usadas', JSON.stringify(unitCodes) === JSON.stringify(UNITS.map((u) => u.code).sort()), `zip=${unitCodes.join(',')}`);

  const movements = (data.movements as Row[]) || [];
  check('Movement.batchId exportado', movements.filter((m) => m.batchId).length === 2, 'dos movimientos con lote');
  const saleItems = ((data.sales as Row[]) || []).flatMap((s) => (s.items as Row[]) || []);
  check('SaleItem.serviceId exportado', saleItems.some((i) => i.serviceId), 'venta de servicio');
  const masters = (data.productMasters as Row[]) || [];
  check('ProductMaster.baseUnitId exportado', masters.length === 3 && masters.every((m) => m.baseUnitId), 'tres productos con unidad base');

  const leaked = FORBIDDEN_CONTENT.filter((pattern) => pattern.test(dataText));
  check('sin contraseñas, SOL ni certificados', leaked.length === 0, leaked.map(String).join(', ') || 'ninguno');
  return checks;
}

function describeDifference(missing: string, extra: string | undefined) {
  if (!extra) return 'fila ausente en la restauración';
  const a = JSON.parse(missing) as Row;
  const b = JSON.parse(extra) as Row;
  const fields = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return fields.map((f) => `${f}: ${JSON.stringify(a[f])} ≠ ${JSON.stringify(b[f])}`).join('; ');
}

// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const writeLegacyFixture = process.argv.includes('--write-legacy-fixture');
  for (const required of ['initdb', 'pg_ctl', 'createdb']) {
    if (!fs.existsSync(executable(required))) throw new Error(`Falta el binario PostgreSQL incluido: ${required}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-roundtrip-'));
  const dataDir = path.join(tempRoot, 'data');
  const port = await freePort();
  const pgEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' };
  const url = (db: string) => `postgresql://postgres@127.0.0.1:${port}/${db}?schema=public`;
  let started = false;
  const clients: PrismaClient[] = [];

  try {
    console.log('Roundtrip: iniciando PostgreSQL desechable...');
    run(executable('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(executable('pg_ctl'), ['start', '-D', dataDir, '-l', path.join(tempRoot, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 });
    started = true;

    for (const db of ['origen', 'destino']) {
      run(executable('createdb'), [db], { env: pgEnv });
      run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
        env: { ...process.env, DATABASE_URL: url(db), DIRECT_URL: url(db) },
      });
    }

    const source = new PrismaClient({ datasources: { db: { url: url('origen') } } });
    const target = new PrismaClient({ datasources: { db: { url: url('destino') } } });
    clients.push(source, target);

    console.log('Roundtrip: sembrando tienda con todos los módulos...');
    await seedUnits(source);
    await seedUnits(target, true); // IDs distintos en destino: obliga a mapear por código.
    const sourceStoreId = await seedStore(source);

    console.log('Roundtrip: exportando con el handler real...');
    const zipPath = path.join(tempRoot, 'respaldo-roundtrip.zip');
    runWorker('export', url('origen'), [`--store=${sourceStoreId}`, `--out=${zipPath}`]);
    if (writeLegacyFixture) {
      fs.mkdirSync(path.dirname(legacyFixture), { recursive: true });
      fs.copyFileSync(zipPath, legacyFixture);
      console.log(`Roundtrip: fixture de compatibilidad guardado en ${path.relative(root, legacyFixture)}`);
    }

    console.log('\nExportación (contenido del ZIP):');
    const exportChecks = await inspectExport(zipPath, source, sourceStoreId);
    for (const { name, ok, detail } of exportChecks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(38)} ${detail}`);
    const exportFailures = exportChecks.filter((c) => !c.ok).length;

    console.log('\nRoundtrip: restaurando en otra base con el handler real...');
    const restored = runWorker('restore', url('destino'), [`--zip=${zipPath}`]);
    if (restored.status !== 200) {
      throw new Error(`La restauración respondió ${restored.status}: ${JSON.stringify(restored.payload)}`);
    }
    const targetStoreId = restored.payload.store.id as string;

    const report = await compareStores(source, sourceStoreId, target, targetStoreId);
    let failures = 0;
    for (const entry of report) {
      const ok = entry.missing.length === 0 && entry.extra.length === 0;
      if (!ok) failures++;
      const label = ok ? 'PASS' : 'FAIL';
      console.log(`${label} ${entry.model.padEnd(20)} origen=${entry.source} restaurado=${entry.target}`);
      if (!ok) {
        entry.missing.slice(0, 3).forEach((sig, i) => console.log(`     · ${describeDifference(sig, entry.extra[i])}`));
      }
    }

    console.log(exportFailures > 0
      ? `\nExportación FAIL: ${exportFailures} de ${exportChecks.length} comprobaciones.`
      : `\nExportación PASS: ${exportChecks.length} comprobaciones.`);
    if (failures > 0) {
      console.log(`Roundtrip FAIL: ${failures} de ${report.length} modelos no se conservan.`);
    } else {
      console.log(`Roundtrip PASS: ${report.length} modelos conservados entre origen y restauración.`);
    }
    if (exportFailures > 0 || failures > 0) process.exitCode = 1;
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect().catch(() => undefined)));
    if (started) {
      try {
        run(executable('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 });
      } catch (error) {
        console.error(`No se pudo detener PostgreSQL desechable: ${(error as Error).message}`);
      }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

const mode = process.argv.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length);
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || '';

(mode === 'export'
  ? exportWorker(arg('store'), arg('out'))
  : mode === 'restore'
    ? restoreWorker(arg('zip'))
    : main()
).then(
  () => {
    if (mode) process.exit(0);
  },
  (error) => {
    console.error((error as Error).stack || error);
    process.exit(1);
  },
);
