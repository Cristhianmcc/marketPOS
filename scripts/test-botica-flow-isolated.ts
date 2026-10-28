/**
 * Banco de pruebas del flujo de botica contra PostgreSQL real.
 *
 * Recorre con los handlers reales: orden de compra con lotes, recepción
 * parcial y reintento idempotente, venta FEFO entre lotes, medicamento
 * controlado (paciente, receta, libro de controlados), lote vencido, alertas de
 * vencimiento, anulación que devuelve los lotes y boleta de un medicamento
 * exonerado. No usa la base del usuario, Supabase ni red.
 *
 * Uso: npx tsx scripts/test-botica-flow-isolated.ts
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const root = path.resolve(__dirname, '..');
const pgBin = path.join(root, 'desktop', 'vendor', 'postgres', 'bin');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const executable = (name: string) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const DAY = 86_400_000;

function run(command: string, args: string[], options: Parameters<typeof spawnSync>[2] = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 240_000, windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} ${args.join(' ')} failed (${result.status})\n${result.stdout || ''}${result.stderr || ''}`);
  return String(result.stdout || '').trim();
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

const dateOnly = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

// ──────────────────────────────────────────────────────────────────────────
// Siembra: botica con flags de farmacia, proveedor, paciente y productos.
// ──────────────────────────────────────────────────────────────────────────

async function seed(db: PrismaClient) {
  await db.unit.create({ data: { code: 'NIU', sunatCode: 'NIU', name: 'Unidad', symbol: 'und', allowDecimals: false, kind: 'GOODS' } });
  const niu = (await db.unit.findUniqueOrThrow({ where: { code: 'NIU' } })).id;
  const store = await db.store.create({ data: { name: 'Botica Prueba', ruc: '20123456789', businessProfile: 'BOTICA' } });
  const storeId = store.id;
  await db.storeSettings.create({ data: { storeId, expiredBatchPolicy: 'BLOCK_EXPIRED', expiryAlertDays: 60, fefoEnabled: true } });
  await db.featureFlag.createMany({
    data: ([
      'ENABLE_BATCH_EXPIRY', 'ENABLE_FEFO_SALES', 'ENABLE_PHARMA_FIELDS', 'ENABLE_SUPPLIERS',
      'ENABLE_PATIENTS', 'ENABLE_CONTROLLED_BOOK', 'ENABLE_RESTRICTED_PRODUCTS', 'ENABLE_SUNAT',
    ] as const).map((key) => ({ storeId, key, enabled: true })),
  });
  await db.sunatSettings.create({ data: { storeId, enabled: true, env: 'BETA', ruc: '20123456789', razonSocial: 'BOTICA PRUEBA S.A.C.', address: 'Av. Salud 1', ubigeo: '150101' } });
  const owner = await db.user.create({ data: { storeId, email: 'qf@botica.test', name: 'Químico Farmacéutico', password: 'x', role: 'OWNER' } });
  await db.shift.create({ data: { storeId, openedById: owner.id, openingCash: 100 } });
  const supplier = await db.supplier.create({ data: { storeId, name: 'Droguería Central', ruc: '20999888777' } });
  const patient = await db.patient.create({ data: { storeId, dni: '12345678', name: 'Paciente Controlado' } });

  const product = async (sku: string, name: string, price: number, extra: Record<string, unknown> = {}, sp: Record<string, unknown> = {}) => {
    const master = await db.productMaster.create({ data: { internalSku: sku, name, unitType: 'UNIT', baseUnitId: niu, ...extra } });
    return (await db.storeProduct.create({ data: { storeId, productId: master.id, price, stock: 0, ...sp } })).id;
  };
  const para = await product('BT-PARA', 'Paracetamol 500mg', 1.5, { genericName: 'Paracetamol' }, { igvAffectation: 'EXONERADO' });
  const amox = await product('BT-AMOX', 'Amoxicilina 500mg', 2, { genericName: 'Amoxicilina', requiresPrescription: true, laboratory: 'Lab Uno' });
  const ibu = await product('BT-IBU', 'Ibuprofeno 400mg', 1, {}, { stock: 5 });
  const vit = await product('BT-VIT', 'Vitamina C 1g', 3, {}, { stock: 5 });

  // Lotes sembrados directamente: uno vencido y uno por vencer.
  await db.productBatch.create({ data: { storeId, storeProductId: ibu, batchNumber: 'IBU-VENC', expiryDate: new Date(Date.now() - DAY), quantityInitial: 5, quantityAvailable: 5 } });
  await db.productBatch.create({ data: { storeId, storeProductId: vit, batchNumber: 'VIT-PRONTO', expiryDate: new Date(Date.now() + 10 * DAY), quantityInitial: 5, quantityAvailable: 5 } });

  return { storeId, ownerId: owner.id, supplierId: supplier.id, patientId: patient.id, sp: { para, amox, ibu, vit } };
}

// ──────────────────────────────────────────────────────────────────────────
// Worker: ejecuta los handlers reales en orden y registra estado tras cada paso.
// ──────────────────────────────────────────────────────────────────────────

async function flowWorker(contextPath: string) {
  const ctx = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const sessionPath = require.resolve('../src/lib/session');
  const session = { userId: ctx.ownerId, storeId: ctx.storeId, email: 'qf@botica.test', name: 'QF', role: 'OWNER', isLoggedIn: true };
  require.cache[sessionPath] = {
    id: sessionPath, filename: sessionPath, loaded: true,
    exports: {
      getCurrentStoreUser: async () => session, getStoreSessionOrThrow: async () => session,
      getSession: async () => session, getCurrentUser: async () => session,
    },
  } as NodeJS.Module;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NextRequest } = require('next/server');
  const { prisma } = require('../src/infra/db/prisma');
  const purchaseOrders = require('../src/app/api/purchase-orders/route');
  const purchaseOrder = require('../src/app/api/purchase-orders/[id]/route');
  const checkout = require('../src/app/api/sales/checkout/route');
  const cancel = require('../src/app/api/sales/[id]/cancel/route');
  const expiryAlerts = require('../src/app/api/expiry-alerts/route');
  const stockRoute = require('../src/app/api/store-products/[id]/stock/route');
  const batchesRoute = require('../src/app/api/batches/route');
  const batchRoute = require('../src/app/api/batches/[id]/route');
  const { buildPayloadFromSale } = require('../src/lib/sunat/buildPayloadFromSale');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const json = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(`http://127.0.0.1${url}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const read = async (response: Response) => ({ status: response.status, body: await response.json() });
  const state = async () => {
    const products = await prisma.storeProduct.findMany({ where: { storeId: ctx.storeId }, include: { batches: { orderBy: { batchNumber: 'asc' } }, product: true } });
    return Object.fromEntries(products.map((p: any) => [p.product.internalSku, {
      stock: Number(p.stock),
      batches: Object.fromEntries(p.batches.map((b: any) => [b.batchNumber, Number(b.quantityAvailable)])),
    }]));
  };
  let checkoutCount = 0;
  const sell = async (items: unknown[], extra: Record<string, unknown> = {}) => {
    if (checkoutCount++ > 0) await new Promise((r) => setTimeout(r, 2200)); // límite de 5 cobros por 10 s
    return read(await checkout.POST(json('/api/sales/checkout', 'POST', { items, paymentMethod: 'CASH', amountPaid: 500, ...extra }, { 'idempotency-key': `botica-${checkoutCount}-${Date.now()}` })));
  };

  const steps: Record<string, unknown> = {};
  const record = async (id: string, result: unknown, extra: Record<string, unknown> = {}) => {
    steps[id] = { result, state: await state(), ...extra };
  };

  // C1 Orden de compra: 30 paracetamol + 20 amoxicilina
  const created = await read(await purchaseOrders.POST(json('/api/purchase-orders', 'POST', {
    supplierId: ctx.supplierId,
    items: [{ storeProductId: ctx.sp.para, quantityOrdered: 30, unitCost: 0.6 }, { storeProductId: ctx.sp.amox, quantityOrdered: 20, unitCost: 0.9 }],
  })));
  const orderId = created.body?.order?.id ?? created.body?.id;
  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { items: true } });
  const itemOf = (sp: string) => order.items.find((i: any) => i.storeProductId === sp).id;
  await record('C1', { status: created.status, orderId: !!orderId });

  // C2 Recepción parcial: 10 paracetamol lote PARA-A (vence en 20 días) + 20 amoxicilina lote AMOX-1
  const receive = (key: string, receivedItems: unknown[]) =>
    purchaseOrder.PATCH(json(`/api/purchase-orders/${orderId}`, 'PATCH', { action: 'receive', receivedItems }, { 'idempotency-key': key }), { params: Promise.resolve({ id: orderId }) });
  const firstItems = [
    { itemId: itemOf(ctx.sp.para), quantityReceived: 10, batchNumber: 'PARA-A', expiryDate: dateOnly(20) },
    { itemId: itemOf(ctx.sp.amox), quantityReceived: 20, batchNumber: 'AMOX-1', expiryDate: dateOnly(200) },
  ];
  await record('C2', await read(await receive('recepcion-1-botica', firstItems)));

  // C3 Reintento exacto de la misma recepción: no debe duplicar
  await record('C3', await read(await receive('recepcion-1-botica', firstItems)));

  // C4 Recepción del saldo: 20 paracetamol lote PARA-B (vence en 300 días)
  await record('C4', await read(await receive('recepcion-2-botica', [
    { itemId: itemOf(ctx.sp.para), quantityReceived: 20, batchNumber: 'PARA-B', expiryDate: dateOnly(300) },
  ])), { orderStatus: (await prisma.purchaseOrder.findUnique({ where: { id: orderId } })).status });

  // C5 Venta FEFO de 15 paracetamol: 10 de PARA-A y 5 de PARA-B
  const fefo = await sell([{ storeProductId: ctx.sp.para, quantity: 15, unitPrice: 1.5 }]);
  const fefoSale = fefo.body.saleId
    ? await prisma.sale.findUnique({ where: { id: fefo.body.saleId }, include: { items: true } })
    : null;
  await record('C5', { status: fefo.status, code: fefo.body.code }, {
    breakdown: fefoSale?.items[0]?.batchBreakdown ?? null,
    batchMovements: fefo.body.saleId
      ? (await prisma.movement.findMany({ where: { storeProductId: ctx.sp.para, type: 'SALE' }, include: { batch: true } })).map((m: any) => `${m.batch?.batchNumber}:${Number(m.quantity)}`).sort()
      : [],
  });

  // C6 Boleta de la venta exonerada: sin IGV
  const boleta = fefo.body.saleId ? await buildPayloadFromSale(prisma, { saleId: fefo.body.saleId, docType: 'BOLETA' }) : null;
  steps.C6 = { totals: boleta?.totals ?? null, affectation: boleta?.items[0]?.igvAffectation ?? null };

  // C7 Controlado sin paciente: debe rechazarse
  await record('C7', await sell([{ storeProductId: ctx.sp.amox, quantity: 2, unitPrice: 2, rxPrescriptionNumber: 'RX-1' }]));

  // C8 Controlado con paciente pero sin número de receta: debe rechazarse
  await record('C8', await sell([{ storeProductId: ctx.sp.amox, quantity: 2, unitPrice: 2, rxPatientName: 'Paciente Controlado' }], { patientId: ctx.patientId, prescribedBy: 'Dr. Prueba' }));

  // C9 Controlado completo: libro de controlados con lote y paciente
  const controlled = await sell(
    [{ storeProductId: ctx.sp.amox, quantity: 2, unitPrice: 2, rxPrescriptionNumber: 'RX-0001', rxPatientName: 'Paciente Controlado' }],
    { patientId: ctx.patientId, prescribedBy: 'Dr. Prueba', cmpNumber: 'CMP-1' },
  );
  const book = await prisma.controlledBookEntry.findMany({ where: { storeId: ctx.storeId } });
  const meds = await prisma.patientMedication.findMany({ where: { patientId: ctx.patientId } });
  await record('C9', { status: controlled.status, code: controlled.body.code, message: controlled.body.message }, {
    book: book.map((e: any) => ({ batch: e.batchNumber, rx: e.prescriptionNumber, dni: e.patientDni, qty: Number(e.quantity) })),
    medications: meds.length,
  });

  // C10 Producto con solo lote vencido: debe rechazarse
  await record('C10', await sell([{ storeProductId: ctx.sp.ibu, quantity: 1, unitPrice: 1 }]));

  // C11 Alertas de vencimiento
  const alerts = await read(await expiryAlerts.GET(json('/api/expiry-alerts', 'GET')));
  steps.C11 = {
    status: alerts.status,
    batches: (alerts.body.batches || []).map((b: any) => `${b.batchNumber}:${b.status}`).sort(),
    summary: alerts.body.summary,
  };

  // C12 Anulación de la venta FEFO: devuelve 10 a PARA-A y 5 a PARA-B
  if (fefo.body.saleId) {
    await record('C12', await read(await cancel.POST(json(`/api/sales/${fefo.body.saleId}/cancel`, 'POST', {}), { params: Promise.resolve({ id: fefo.body.saleId }) })));
  }

  // Regla de botica: un producto con lotes no admite stock sin lote.
  const adjust = async (body: Record<string, unknown>) =>
    read(await stockRoute.PATCH(json(`/api/store-products/${ctx.sp.para}/stock`, 'PATCH', { type: 'ADJUSTMENT', ...body }), { params: Promise.resolve({ id: ctx.sp.para }) }));
  const lotId = async (batchNumber: string) => (await prisma.productBatch.findFirst({ where: { storeProductId: ctx.sp.para, batchNumber } })).id;

  // C13 Entrada manual sin lote: se rechaza y el stock no cambia
  await record('C13', await adjust({ quantity: 5, notes: 'sin lote' }));

  // C14 Salida manual sin indicar lote: se rechaza
  await record('C14', await adjust({ quantity: -2 }));

  // C15 Salida manual de 2 del lote PARA-A: baja lote y stock juntos
  await record('C15', await adjust({ quantity: -2, batchId: await lotId('PARA-A'), notes: 'rotura' }), {
    movementBatch: (await prisma.movement.findFirst({ where: { storeProductId: ctx.sp.para, notes: 'rotura' }, include: { batch: true } }))?.batch?.batchNumber ?? null,
  });

  // C16 Salida de 25 del lote PARA-B (tiene 20; el stock general sí alcanza): se rechaza sin tocar nada
  await record('C16', await adjust({ quantity: -25, batchId: await lotId('PARA-B') }));

  // C17 Entrada correcta por Lotes: PARA-C con 5 unidades
  const newLot = (batchNumber: string, quantity: number) => batchesRoute.POST(json('/api/batches', 'POST', {
    storeProductId: ctx.sp.para, batchNumber, quantity, expiryDate: new Date(Date.now() + 300 * DAY).toISOString(),
  }));
  await record('C17', await read(await newLot('PARA-C', 5)));

  // C18 Registrar PARA-D (4) y darlo de baja: el stock vuelve a lo anterior
  await read(await newLot('PARA-D', 4));
  const lotD = await lotId('PARA-D');
  await record('C18', await read(await batchRoute.PATCH(json(`/api/batches/${lotD}?action=deactivate`, 'PATCH'), { params: Promise.resolve({ id: lotD }) })));

  // C19 Venta de todo el stock (33) consume los tres lotes vigentes
  await record('C19', await sell([{ storeProductId: ctx.sp.para, quantity: 33, unitPrice: 1.5 }]));

  // C20 Stock suelto heredado (anterior a la regla): no se vende sin lote y el mensaje orienta a Lotes
  await prisma.storeProduct.update({ where: { id: ctx.sp.para }, data: { stock: { increment: 5 } } });
  await record('C20', await sell([{ storeProductId: ctx.sp.para, quantity: 1, unitPrice: 1.5 }]));

  console.log(`RESULT:${JSON.stringify(steps)}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Expectativas
// ──────────────────────────────────────────────────────────────────────────

type Steps = Record<string, any>;
interface Expectation { id: string; title: string; check: (s: Steps) => string[]; rule?: boolean }

const ok = (step: any) => step?.result?.status >= 200 && step?.result?.status < 300;
const eq = (label: string, actual: unknown, expected: unknown) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? [] : [`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`];

const EXPECTATIONS: Expectation[] = [
  { id: 'C1', title: 'Crea orden de compra con proveedor', check: (s) => (ok(s.C1) && s.C1.result.orderId ? [] : [`respondió ${JSON.stringify(s.C1?.result)}`]) },
  { id: 'C2', title: 'Recepción parcial con lotes suma stock y crea lotes', check: (s) => [
    ...(ok(s.C2) ? [] : [`respondió ${s.C2?.result?.status} ${JSON.stringify(s.C2?.result?.body)}`]),
    ...eq('paracetamol', s.C2?.state?.['BT-PARA'], { stock: 10, batches: { 'PARA-A': 10 } }),
    ...eq('amoxicilina', s.C2?.state?.['BT-AMOX'], { stock: 20, batches: { 'AMOX-1': 20 } }),
  ] },
  { id: 'C3', title: 'Reintento de la misma recepción no duplica', check: (s) => [
    ...(ok(s.C3) ? [] : [`respondió ${s.C3?.result?.status}`]),
    ...eq('paracetamol', s.C3?.state?.['BT-PARA'], { stock: 10, batches: { 'PARA-A': 10 } }),
  ] },
  { id: 'C4', title: 'Recepción del saldo completa la orden', check: (s) => [
    ...(ok(s.C4) ? [] : [`respondió ${s.C4?.result?.status} ${JSON.stringify(s.C4?.result?.body)}`]),
    ...eq('paracetamol', s.C4?.state?.['BT-PARA'], { stock: 30, batches: { 'PARA-A': 10, 'PARA-B': 20 } }),
    ...eq('estado de la orden', s.C4?.orderStatus, 'RECEIVED'),
  ] },
  { id: 'C5', title: 'Venta FEFO consume primero el lote que vence antes', check: (s) => [
    ...(ok(s.C5) ? [] : [`respondió ${s.C5?.result?.status} ${s.C5?.result?.code}`]),
    ...eq('paracetamol', s.C5?.state?.['BT-PARA'], { stock: 15, batches: { 'PARA-A': 0, 'PARA-B': 15 } }),
    ...eq('movimientos por lote', s.C5?.batchMovements, ['PARA-A:-10', 'PARA-B:-5']),
  ] },
  { id: 'C6', title: 'Boleta de medicamento exonerado sin IGV', check: (s) => [
    ...eq('afectación', s.C6?.affectation, 'EXONERADO'),
    ...eq('totales', { exempt: s.C6?.totals?.exempt, tax: s.C6?.totals?.tax, total: s.C6?.totals?.total }, { exempt: 22.5, tax: 0, total: 22.5 }),
  ] },
  { id: 'C7', title: 'Rechaza controlado sin paciente', check: (s) => [
    ...eq('respuesta', s.C7?.result?.status, 422),
    ...eq('amoxicilina', s.C7?.state?.['BT-AMOX']?.stock, 20),
  ] },
  { id: 'C8', title: 'Rechaza controlado sin número de receta', check: (s) => [
    ...eq('respuesta', s.C8?.result?.status, 422),
    ...eq('amoxicilina', s.C8?.state?.['BT-AMOX']?.stock, 20),
  ] },
  { id: 'C9', title: 'Controlado completo registra libro, lote y paciente', check: (s) => [
    ...(ok(s.C9) ? [] : [`respondió ${s.C9?.result?.status} ${s.C9?.result?.code}: ${s.C9?.result?.message}`]),
    ...eq('libro de controlados', s.C9?.book, [{ batch: 'AMOX-1', rx: 'RX-0001', dni: '12345678', qty: 2 }]),
    ...eq('historial del paciente', s.C9?.medications, 1),
    ...eq('amoxicilina', s.C9?.state?.['BT-AMOX'], { stock: 18, batches: { 'AMOX-1': 18 } }),
  ] },
  { id: 'C10', title: 'Bloquea venta con solo lote vencido', check: (s) => [
    ...eq('respuesta', s.C10?.result?.status, 409),
    ...eq('ibuprofeno', s.C10?.state?.['BT-IBU']?.stock, 5),
  ] },
  { id: 'C11', title: 'Alertas: vencido y por vencer', check: (s) => [
    ...eq('respuesta', s.C11?.status, 200),
    ...(s.C11?.batches?.includes('IBU-VENC:VENCIDO') ? [] : [`falta IBU-VENC vencido en ${JSON.stringify(s.C11?.batches)}`]),
    ...(s.C11?.batches?.includes('VIT-PRONTO:POR_VENCER') ? [] : [`falta VIT-PRONTO por vencer en ${JSON.stringify(s.C11?.batches)}`]),
  ] },
  { id: 'C12', title: 'Anulación devuelve stock y cada lote', check: (s) => [
    ...(ok(s.C12) ? [] : [`respondió ${s.C12?.result?.status} ${JSON.stringify(s.C12?.result?.body)}`]),
    ...eq('paracetamol', s.C12?.state?.['BT-PARA'], { stock: 30, batches: { 'PARA-A': 10, 'PARA-B': 20 } }),
  ] },
  { id: 'C13', title: 'Rechaza entrada manual sin lote', check: (s) => [
    ...eq('respuesta', [s.C13?.result?.status, s.C13?.result?.body?.code], [409, 'LOT_REQUIRED']),
    ...eq('paracetamol', s.C13?.state?.['BT-PARA'], { stock: 30, batches: { 'PARA-A': 10, 'PARA-B': 20 } }),
  ] },
  { id: 'C14', title: 'Rechaza salida manual sin lote', check: (s) => [
    ...eq('respuesta', [s.C14?.result?.status, s.C14?.result?.body?.code], [400, 'LOT_REQUIRED']),
    ...eq('paracetamol', s.C14?.state?.['BT-PARA']?.stock, 30),
  ] },
  { id: 'C15', title: 'Salida manual con lote baja lote y stock', check: (s) => [
    ...(ok(s.C15) ? [] : [`respondió ${s.C15?.result?.status} ${JSON.stringify(s.C15?.result?.body)}`]),
    ...eq('paracetamol', s.C15?.state?.['BT-PARA'], { stock: 28, batches: { 'PARA-A': 8, 'PARA-B': 20 } }),
    ...eq('lote del movimiento', s.C15?.movementBatch, 'PARA-A'),
  ] },
  { id: 'C16', title: 'Rechaza salida mayor que el lote sin tocar stock', check: (s) => [
    ...eq('respuesta', s.C16?.result?.status, 409),
    ...eq('paracetamol', s.C16?.state?.['BT-PARA'], { stock: 28, batches: { 'PARA-A': 8, 'PARA-B': 20 } }),
  ] },
  { id: 'C17', title: 'Entrada por Lotes suma al stock', check: (s) => [
    ...eq('respuesta', s.C17?.result?.status, 201),
    ...eq('paracetamol', s.C17?.state?.['BT-PARA'], { stock: 33, batches: { 'PARA-A': 8, 'PARA-B': 20, 'PARA-C': 5 } }),
  ] },
  { id: 'C18', title: 'Baja de lote descuenta lo que quedaba', check: (s) => [
    ...(ok(s.C18) ? [] : [`respondió ${s.C18?.result?.status} ${JSON.stringify(s.C18?.result?.body)}`]),
    ...eq('paracetamol', s.C18?.state?.['BT-PARA'], { stock: 33, batches: { 'PARA-A': 8, 'PARA-B': 20, 'PARA-C': 5, 'PARA-D': 0 } }),
  ] },
  { id: 'C19', title: 'Vende todo el stock y cuadra con los lotes', check: (s) => [
    ...(ok(s.C19) ? [] : [`respondió ${s.C19?.result?.status} ${s.C19?.result?.body?.code}: ${s.C19?.result?.body?.message}`]),
    ...eq('paracetamol', s.C19?.state?.['BT-PARA'], { stock: 0, batches: { 'PARA-A': 0, 'PARA-B': 0, 'PARA-C': 0, 'PARA-D': 0 } }),
  ] },
  { id: 'C20', title: 'Sin lote vigente no vende y orienta a Lotes', check: (s) => [
    ...eq('respuesta', [s.C20?.result?.status, s.C20?.result?.body?.code], [409, 'INSUFFICIENT_BATCH_STOCK']),
    ...eq('paracetamol', s.C20?.state?.['BT-PARA']?.stock, 5),
    ...(/Lotes/.test(s.C20?.result?.body?.message ?? s.C20?.result?.body?.error ?? '') ? [] : [`mensaje: ${JSON.stringify(s.C20?.result?.body)}`]),
  ] },
];

// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-botica-'));
  const dataDir = path.join(tempRoot, 'data');
  const port = await freePort();
  const url = `postgresql://postgres@127.0.0.1:${port}/botica?schema=public`;
  let started = false;
  let db: PrismaClient | null = null;
  try {
    console.log('Botica: iniciando PostgreSQL desechable...');
    run(executable('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(executable('pg_ctl'), ['start', '-D', dataDir, '-l', path.join(tempRoot, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 });
    started = true;
    run(executable('createdb'), ['botica'], { env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' } });
    run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });

    db = new PrismaClient({ datasources: { db: { url } } });
    const context = await seed(db);
    const contextPath = path.join(tempRoot, 'context.json');
    fs.writeFileSync(contextPath, JSON.stringify(context));

    console.log('Botica: ejecutando el flujo con los handlers reales...\n');
    const worker = spawnSync(process.execPath, [tsxCli, __filename, '--mode=flow', `--context=${contextPath}`], {
      cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true,
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, NODE_ENV: 'test' },
    });
    const line = String(worker.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT:'));
    if (worker.status !== 0 || !line) throw new Error(`Worker falló (${worker.status})\n${worker.stdout}${worker.stderr}`);
    const steps = JSON.parse(line.slice('RESULT:'.length)) as Steps;

    const defects: string[] = [];
    const rules: string[] = [];
    for (const expectation of EXPECTATIONS) {
      const problems = expectation.check(steps);
      console.log(`${problems.length ? (expectation.rule ? 'REGLA' : 'FAIL') : 'PASS'} ${expectation.id} ${expectation.title}`);
      problems.forEach((p) => console.log(`       · ${p}`));
      if (problems.length) (expectation.rule ? rules : defects).push(expectation.id);
    }
    console.log(`\nBotica: ${EXPECTATIONS.length - defects.length - rules.length}/${EXPECTATIONS.length} pasos correctos; defectos: ${defects.join(', ') || 'ninguno'}; reglas por decidir: ${rules.join(', ') || 'ninguna'}.`);
    if (defects.length > 0) process.exitCode = 1;
  } finally {
    await db?.$disconnect().catch(() => undefined);
    if (started) {
      try { run(executable('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 }); } catch { /* ignore */ }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

const mode = process.argv.find((a) => a.startsWith('--mode='))?.slice(7);
const contextArg = process.argv.find((a) => a.startsWith('--context='))?.slice(10) || '';
(mode === 'flow' ? flowWorker(contextArg) : main()).then(
  () => { if (mode) process.exit(0); },
  (error) => { console.error((error as Error).stack || error); process.exit(1); },
);
