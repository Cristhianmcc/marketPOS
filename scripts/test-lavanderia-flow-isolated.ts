/**
 * Banco de pruebas del flujo de lavandería contra PostgreSQL real (Fase 0).
 *
 * Recorre con los handlers reales: recepción de una orden con lavado por kilo
 * y prendas, estados Recibido → En proceso → Listo, adelanto, recargo express,
 * entrega con venta y boleta, cobro doble simultáneo, caja del turno y
 * anulación. No usa la base del usuario, Supabase ni red.
 *
 * Resultado: PASS, FAIL (defecto), FALTA (funcionalidad del plan aún no hecha)
 * o REGLA (decisión del dueño pendiente).
 *
 * Uso: npx tsx scripts/test-lavanderia-flow-isolated.ts
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

// ──────────────────────────────────────────────────────────────────────────
// Siembra: lavandería con servicios por kilo y por prenda, cliente y turno.
// ──────────────────────────────────────────────────────────────────────────

async function seed(db: PrismaClient) {
  await db.unit.create({ data: { code: 'NIU', sunatCode: 'NIU', name: 'Unidad', symbol: 'und', allowDecimals: false, kind: 'GOODS' } });
  await db.unit.create({ data: { code: 'KGM', sunatCode: 'KGM', name: 'Kilogramo', symbol: 'kg', allowDecimals: true, kind: 'GOODS' } });
  const niu = (await db.unit.findUniqueOrThrow({ where: { code: 'NIU' } })).id;
  const kgm = (await db.unit.findUniqueOrThrow({ where: { code: 'KGM' } })).id;
  const store = await db.store.create({ data: { name: 'Lavandería Prueba', ruc: '20123456789', businessProfile: 'LAVANDERIA' } });
  const storeId = store.id;
  await db.featureFlag.createMany({
    data: (['ENABLE_SERVICES', 'ENABLE_WORK_ORDERS', 'ENABLE_SUNAT'] as const).map((key) => ({ storeId, key, enabled: true })),
  });
  await db.sunatSettings.create({ data: { storeId, enabled: true, env: 'BETA', ruc: '20123456789', razonSocial: 'LAVANDERIA PRUEBA S.A.C.', address: 'Av. Limpia 1', ubigeo: '150101' } });
  const owner = await db.user.create({ data: { storeId, email: 'dueno@lavanderia.test', name: 'Dueño', password: 'x', role: 'OWNER' } });
  const shift = await db.shift.create({ data: { storeId, openedById: owner.id, openingCash: 100 } });
  const customer = await db.customer.create({ data: { storeId, name: 'Cliente Lavado', phone: '999111222' } });
  const kilo = await db.service.create({ data: { storeId, name: 'Lavado por kilo', price: 5, baseUnitId: kgm } });
  const terno = await db.service.create({ data: { storeId, name: 'Terno al seco', price: 15, baseUnitId: niu } });
  const master = await db.productMaster.create({ data: { internalSku: 'LV-DET', name: 'Detergente 1 kg', unitType: 'UNIT', baseUnitId: niu } });
  const detergent = (await db.storeProduct.create({ data: { storeId, productId: master.id, price: 8, stock: 5 } })).id;
  return { storeId, detergent, ownerId: owner.id, shiftId: shift.id, customerId: customer.id, kilo: kilo.id, terno: terno.id, units: { niu, kgm } };
}

// ──────────────────────────────────────────────────────────────────────────
// Worker: ejecuta los handlers reales en orden y registra lo observado.
// ──────────────────────────────────────────────────────────────────────────

async function flowWorker(contextPath: string) {
  const ctx = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const sessionPath = require.resolve('../src/lib/session');
  const session = { userId: ctx.ownerId, storeId: ctx.storeId, email: 'dueno@lavanderia.test', name: 'Dueño', role: 'OWNER', isLoggedIn: true };
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
  const workOrders = require('../src/app/api/work-orders/route');
  const convert = require('../src/app/api/work-orders/[id]/convert-to-sale/route');
  const payments = require('../src/app/api/work-orders/[id]/payments/route');
  const cancel = require('../src/app/api/sales/[id]/cancel/route');
  const { getProfileFlags } = require('../src/lib/businessProfiles');
  const { PrismaShiftRepository } = require('../src/infra/db/repositories/PrismaShiftRepository');
  const { buildPayloadFromSale } = require('../src/lib/sunat/buildPayloadFromSale');
  const { recordAdvance } = require('../src/lib/workOrders/payments');
  const { ensureProfileFlags, invalidateStoreFlags } = require('../src/lib/featureFlags');
  const { getRubroFlagChanges } = require('../src/lib/businessProfiles');
  const laundryPrice = require('../src/app/api/store/laundry-price/route');
  const storeRoute = require('../src/app/api/store/route');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const json = (url: string, method: string, body?: unknown) =>
    new NextRequest(`http://127.0.0.1${url}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const read = async (response: Response) => ({ status: response.status, body: await response.json() });
  const kiloItem = (kg: number, unitPrice = 5) => ({ type: 'SERVICE', serviceId: ctx.kilo, quantityBase: kg, unitPrice, unitIdUsed: ctx.units.kgm });
  const ternoItem = (qty: number, unitPrice = 15) => ({ type: 'SERVICE', serviceId: ctx.terno, quantityBase: qty, unitPrice, unitIdUsed: ctx.units.niu });
  const create = async (items: unknown[], extra: Record<string, unknown> = {}) =>
    read(await workOrders.POST(json('/api/work-orders', 'POST', { customerId: ctx.customerId, items, ...extra })));
  const setStatus = async (id: string, status: string) => read(await workOrders.PATCH(json('/api/work-orders', 'PATCH', { id, status })));
  const charge = async (id: string, body: Record<string, unknown>) =>
    read(await convert.POST(json(`/api/work-orders/${id}/convert-to-sale`, 'POST', body), { params: Promise.resolve({ id }) }));
  const orderState = async (id: string) => {
    const o = await prisma.workOrder.findUnique({ where: { id }, include: { sale: true } });
    return o ? { status: o.status, total: Number(o.total), advancePaid: Number(o.advancePaid), saleId: o.saleId, saleTotal: o.sale ? Number(o.sale.total) : null } : null;
  };
  const advance = async (id: string, amount: number, method = 'CASH') =>
    read(await payments.POST(json(`/api/work-orders/${id}/payments`, 'POST', { amount, method }), { params: Promise.resolve({ id }) }));
  const shiftRepo = new PrismaShiftRepository();
  const cashOfShift = async () => ({
    cash: await shiftRepo.getCashSalesTotal(ctx.shiftId),
    byMethod: (await shiftRepo.getSalesByMethod(ctx.shiftId)).byMethod,
  });

  const steps: Record<string, unknown> = {};

  // L1 El rubro lavandería trae órdenes de trabajo (seguimiento de prendas)
  steps.L1 = { flags: getProfileFlags('LAVANDERIA') };

  // L2 Recepción: 3,5 kg de lavado (S/ 5/kg) + 2 ternos (S/ 15) = S/ 47,50
  const main = await create([kiloItem(3.5), ternoItem(2)], { notes: 'Camisa blanca con mancha' });
  const mainId = main.body?.data?.id;
  steps.L2 = { result: { status: main.status }, order: mainId ? await orderState(mainId) : null };

  // L3 Precio distinto al catálogo (S/ 1 el kilo): el cajero cobra el de catálogo, el dueño puede cambiarlo
  session.role = 'CASHIER';
  const cheap = await create([kiloItem(3, 1)]);
  session.role = 'OWNER';
  const ownerPrice = await create([kiloItem(3, 4)]);
  steps.L3 = {
    cashierTotal: cheap.body?.data ? Number(cheap.body.data.total) : null,
    ownerTotal: ownerPrice.body?.data ? Number(ownerPrice.body.data.total) : null,
  };

  // L4 Media prenda: un servicio por prenda no admite 1,5 unidades
  const half = await create([ternoItem(1.5)]);
  steps.L4 = { result: { status: half.status, error: half.body?.error } };

  // L5 Estados: Recibido → En proceso → Listo
  const flow = [];
  for (const status of ['APPROVED', 'IN_PROGRESS', 'READY']) {
    const r = await setStatus(mainId, status);
    flow.push(`${status}:${r.status}`);
  }
  steps.L5 = { flow, order: await orderState(mainId) };

  // L6 Marcar Entregado (CLOSED) sin cobrar: debe exigir la venta
  const skip = await create([ternoItem(1)]);
  const skipId = skip.body?.data?.id;
  await setStatus(skipId, 'APPROVED');
  const closed = await setStatus(skipId, 'CLOSED');
  steps.L6 = { result: { status: closed.status }, order: await orderState(skipId) };

  // L7 Adelanto: S/ 20 en efectivo a cuenta de la orden de S/ 47,50; luego S/ 30 más (excede)
  const first = await advance(mainId, 20);
  const excess = await advance(mainId, 30);
  // Dos adelantos simultáneos de S/ 20 en una orden de S/ 30: el primero mantiene
  // su transacción abierta mientras llega el segundo; solo uno debe entrar.
  const pair = await create([kiloItem(6)]);
  const pairId = pair.body?.data?.id;
  await setStatus(pairId, 'APPROVED');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const slowFirst = prisma.$transaction(async (tx: any) => {
    await recordAdvance(tx, { storeId: ctx.storeId, workOrderId: pairId, shiftId: ctx.shiftId, userId: ctx.ownerId, amount: 20, method: 'CASH' });
    await sleep(800);
  }, { timeout: 10_000 }).then(() => ({ status: 201 }), () => ({ status: 409 }));
  await sleep(200);
  const racing = await Promise.all([slowFirst, advance(pairId, 20)]);
  steps.L7 = {
    first: { status: first.status, balance: first.body?.data?.balance },
    excess: excess.status,
    racing: racing.map((r) => r.status).sort(),
    main: await orderState(mainId),
    pair: await orderState(pairId),
    paymentsOfPair: await prisma.workOrderPayment.count({ where: { workOrderId: pairId } }),
  };


  // L9 Entrega: saldo de S/ 27,50 (47,50 - adelanto 20) pagado con S/ 30
  const short = await charge(mainId, { paymentMethod: 'CASH', amountPaid: 25 });
  const paid = await charge(mainId, { paymentMethod: 'CASH', amountPaid: 30 });
  const sale = paid.body?.data?.saleId ? await prisma.sale.findUnique({ where: { id: paid.body.data.saleId }, include: { items: true } }) : null;
  steps.L9 = {
    result: { status: paid.status, error: paid.body?.error },
    order: await orderState(mainId),
    change: sale ? Number(sale.changeAmount) : null,
    advanceApplied: sale ? Number(sale.advanceApplied) : null,
    short: short.status,
    shift: sale?.shiftId === ctx.shiftId,
  };

  // L10 IGV de la venta y de la boleta: 47,50 gravado → base 40,25 + IGV 7,25
  const boleta = sale ? await buildPayloadFromSale(prisma, { saleId: sale.id, docType: 'BOLETA' }) : null;
  steps.L10 = {
    saleTax: sale ? Number(sale.tax) : null,
    items: sale?.items.map((i: any) => ({ unit: i.unitSunatCode, qty: Number(i.quantity), taxable: i.taxableAmount == null ? null : Number(i.taxableAmount), igv: i.igvAmount == null ? null : Number(i.igvAmount) })),
    totals: boleta ? { taxable: boleta.totals.subtotal, tax: boleta.totals.tax, total: boleta.totals.total } : null,
  };

  // L11 Doble cobro simultáneo de la misma orden (doble clic / dos cajas)
  const twice = await create([kiloItem(2)]);
  const twiceId = twice.body?.data?.id;
  await setStatus(twiceId, 'APPROVED');
  await setStatus(twiceId, 'READY');
  const both = await Promise.all([
    charge(twiceId, { paymentMethod: 'CASH', amountPaid: 10 }),
    charge(twiceId, { paymentMethod: 'CASH', amountPaid: 10 }),
  ]);
  const salesForTwice = await prisma.saleItem.count({ where: { serviceId: ctx.kilo, quantity: 2, sale: { total: { gt: 0 } } } });
  // Segundo cobro con una lectura vieja de la orden (leída antes de que el primero terminara)
  const stale = await prisma.workOrder.findUnique({ where: { id: twiceId }, include: { items: { include: { storeProduct: { include: { product: { include: { baseUnit: true } } } }, service: true } }, customer: true } });
  const realFindFirst = prisma.workOrder.findFirst;
  prisma.workOrder.findFirst = async () => ({ ...stale, status: 'READY', saleId: null });
  const replay = await charge(twiceId, { paymentMethod: 'CASH', amountPaid: 10 });
  prisma.workOrder.findFirst = realFindFirst;
  const salesAfterReplay = await prisma.saleItem.count({ where: { serviceId: ctx.kilo, quantity: 2, sale: { total: { gt: 0 } } } });
  steps.L11 = { statuses: both.map((b) => b.status).sort(), sales: salesForTwice, order: await orderState(twiceId), replay: replay.status, salesAfterReplay };

  // L12 Caja: adelantos 20 + 20, saldo 27,50 y la orden de 10 = 77,50 (el adelanto no se cuenta dos veces)
  steps.L12 = await cashOfShift();

  // L13 Anular la venta de una orden entregada
  const cancelled = sale ? await read(await cancel.POST(json(`/api/sales/${sale.id}/cancel`, 'POST', {}), { params: Promise.resolve({ id: sale.id }) })) : null;
  const afterCancel = await orderState(mainId);
  const recharge = await charge(mainId, { paymentMethod: 'CASH', amountPaid: 27.5 });
  steps.L13 = { result: cancelled ? { status: cancelled.status } : null, order: afterCancel, recharge: recharge.status, final: await orderState(mainId) };

  // L14 Producto dentro de la orden (detergente): descuenta stock y deja movimiento
  const withProduct = await create([kiloItem(1), { type: 'PRODUCT', storeProductId: ctx.detergent, quantityBase: 2, unitPrice: 8 }]);
  const wpId = withProduct.body?.data?.id;
  await setStatus(wpId, 'APPROVED');
  await setStatus(wpId, 'READY');
  const wp = await charge(wpId, { paymentMethod: 'CASH', amountPaid: 50 });
  const detergentState = await prisma.storeProduct.findUnique({ where: { id: ctx.detergent } });
  const detergentMoves = await prisma.movement.findMany({ where: { storeProductId: ctx.detergent, type: 'SALE' } });
  steps.L14 = { result: { status: wp.status, error: wp.body?.error }, stock: Number(detergentState.stock), moves: detergentMoves.map((m: any) => Number(m.quantity)) };

  // L16 Editar la orden con adelanto 20 a un total de S/ 5: se rechaza
  const shrink = await read(await workOrders.PATCH(json('/api/work-orders', 'PATCH', { id: pairId, items: [kiloItem(1)] })));
  steps.L16 = { status: shrink.status, order: await orderState(pairId) };

  // L15 Cancelar la orden con adelanto (20 efectivo + 5 Yape): se devuelve por método
  await advance(pairId, 5, 'YAPE');
  const dropped = await read(await workOrders.DELETE(json('/api/work-orders', 'DELETE', { id: pairId })));
  const refunds = await prisma.workOrderPayment.findMany({ where: { workOrderId: pairId, kind: 'REFUND' }, orderBy: { method: 'asc' } });
  steps.L15 = {
    status: dropped.status, refunded: dropped.body?.refunded, order: await orderState(pairId),
    refunds: refunds.map((r: any) => `${r.method}:${Number(r.amount)}`),
    shift: await cashOfShift(),
  };

  // L17 Trabajo libre (lo que se pesa al recibir): el cajero escribe trabajo, kilos y total
  session.role = 'CASHIER';
  const free = await create([{ type: 'SERVICE', itemName: 'Lavado de ropa', itemContent: '5 kg', quantityBase: 1, unitPrice: 25 }]);
  const noPrice = await create([{ type: 'SERVICE', itemName: 'Lavado de ropa', quantityBase: 1 }]);
  const noName = await create([{ type: 'SERVICE', itemName: ' ', quantityBase: 1, unitPrice: 10 }]);
  session.role = 'OWNER';
  const freeId = free.body?.data?.id;
  const freeItem = freeId ? (await prisma.workOrderItem.findFirst({ where: { workOrderId: freeId } })) : null;
  await setStatus(freeId, 'APPROVED');
  const freePaid = await charge(freeId, { paymentMethod: 'CASH', amountPaid: 25 });
  const freeSaleItem = freePaid.body?.data?.saleId ? await prisma.saleItem.findFirst({ where: { saleId: freePaid.body.data.saleId } }) : null;
  const freeBoleta = freePaid.body?.data?.saleId ? await buildPayloadFromSale(prisma, { saleId: freePaid.body.data.saleId, docType: 'BOLETA' }) : null;
  steps.L17 = {
    created: free.status,
    item: freeItem && { name: freeItem.itemName, content: freeItem.itemContent, qty: Number(freeItem.quantityBase), subtotal: Number(freeItem.subtotal) },
    rejected: [noPrice.status, noName.status],
    sale: freeSaleItem && { status: freePaid.status, name: freeSaleItem.productName, content: freeSaleItem.productContent, total: Number(freeSaleItem.totalLine) },
    boletaTotal: freeBoleta?.totals?.total ?? null,
  };

  // L18 Módulos por rubro: lavandería apaga los de farmacia y completa los que falten
  const changes = getRubroFlagChanges('LAVANDERIA');
  await prisma.featureFlag.deleteMany({ where: { storeId: ctx.storeId, key: 'ENABLE_WORK_ORDERS' } });
  await prisma.featureFlag.upsert({ where: { storeId_key: { storeId: ctx.storeId, key: 'ENABLE_SERVICES' } }, update: { enabled: false }, create: { storeId: ctx.storeId, key: 'ENABLE_SERVICES', enabled: false } });
  invalidateStoreFlags(ctx.storeId);
  await ensureProfileFlags(ctx.storeId);
  const flagRows = await prisma.featureFlag.findMany({ where: { storeId: ctx.storeId, key: { in: ['ENABLE_WORK_ORDERS', 'ENABLE_SERVICES'] } } });
  await prisma.featureFlag.update({ where: { storeId_key: { storeId: ctx.storeId, key: 'ENABLE_SERVICES' } }, data: { enabled: true } });
  invalidateStoreFlags(ctx.storeId);
  steps.L18 = {
    enable: changes.enable,
    disablesPharma: ['ENABLE_PATIENTS', 'ENABLE_BATCH_EXPIRY', 'ENABLE_CONTROLLED_BOOK'].every((f: string) => changes.disable.includes(f)),
    keepsOwn: !changes.disable.includes('ENABLE_WORK_ORDERS') && !changes.disable.includes('ENABLE_SERVICES'),
    flags: Object.fromEntries(flagRows.map((f: any) => [f.key, f.enabled])),
  };

  // L19 Precio del kilo de hoy: solo el dueño; no toca el resto de la configuración
  const setPrice = async (price: unknown) => read(await laundryPrice.PATCH(json('/api/store/laundry-price', 'PATCH', { price })));
  session.role = 'CASHIER';
  const cashierPrice = await setPrice(6);
  session.role = 'OWNER';
  const badPrice = await setPrice(-1);
  const okPrice = await setPrice(5.5);
  const storeView = await read(await storeRoute.GET(json('/api/store', 'GET')));
  steps.L19 = {
    cashier: cashierPrice.status, bad: badPrice.status, ok: [okPrice.status, okPrice.body?.laundryKgPrice],
    seen: storeView.body?.store?.settings?.laundryKgPrice != null ? Number(storeView.body.store.settings.laundryKgPrice) : null,
    ruc: storeView.body?.store?.ruc ?? null,
  };

  // L8 Express: 2 kg (10) + 1 terno (15) = 25 con recargo 50 % = 37,50 y fecha prometida
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const fast = await create([kiloItem(2), ternoItem(1)], { express: true, promisedAt: tomorrow });
  const fastId = fast.body?.data?.id;
  const pastDate = await create([kiloItem(1)], { promisedAt: yesterday });
  const order0 = await orderState(fastId);
  const fastRow = await prisma.workOrder.findUnique({ where: { id: fastId } });
  const toggleOff = await read(await workOrders.PATCH(json('/api/work-orders', 'PATCH', { id: fastId, express: false })));
  const offTotal = (await orderState(fastId))?.total;
  await read(await workOrders.PATCH(json('/api/work-orders', 'PATCH', { id: fastId, express: true })));
  const onTotal = (await orderState(fastId))?.total;
  await setStatus(fastId, 'APPROVED');
  await advance(fastId, 30);
  const blockedOff = await read(await workOrders.PATCH(json('/api/work-orders', 'PATCH', { id: fastId, express: false })));
  await setStatus(fastId, 'READY');
  const fastPaid = await charge(fastId, { paymentMethod: 'CASH', amountPaid: 7.5 });
  const fastSale = fastPaid.body?.data?.saleId
    ? await prisma.sale.findUnique({ where: { id: fastPaid.body.data.saleId }, include: { items: true } })
    : null;
  const fastBoleta = fastSale ? await buildPayloadFromSale(prisma, { saleId: fastSale.id, docType: 'BOLETA' }) : null;
  // Porcentaje configurado por la tienda: 40 %
  await prisma.storeSettings.upsert({ where: { storeId: ctx.storeId }, update: { expressSurchargePercent: 40 }, create: { storeId: ctx.storeId, expressSurchargePercent: 40 } });
  const forty = await create([kiloItem(2)], { express: true });
  steps.L8 = {
    created: { status: fast.status, total: order0?.total, surcharge: Number(fastRow?.expressSurcharge), promised: !!fastRow?.promisedAt },
    pastDate: pastDate.status,
    toggle: { off: [toggleOff.status, offTotal], on: onTotal },
    blockedOff: blockedOff.status,
    sale: fastSale && {
      status: fastPaid.status,
      total: Number(fastSale.total),
      lines: fastSale.items.map((i: any) => `${i.productName}:${Number(i.totalLine)}`).sort(),
      linesSum: Math.round(fastSale.items.reduce((t: number, i: any) => t + Number(i.totalLine), 0) * 100) / 100,
      change: Number(fastSale.changeAmount),
    },
    boleta: fastBoleta ? { total: fastBoleta.totals.total, tax: fastBoleta.totals.tax, lines: fastBoleta.items.length } : null,
    forty: forty.body?.data ? Number(forty.body.data.total) : null,
  };

  console.log(`RESULT:${JSON.stringify(steps)}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Expectativas
// ──────────────────────────────────────────────────────────────────────────

type Steps = Record<string, any>;
type Kind = 'defect' | 'missing' | 'rule';
interface Expectation { id: string; title: string; kind?: Kind; check: (s: Steps) => string[] }

const ok = (step: any) => step?.result?.status >= 200 && step?.result?.status < 300;
const eq = (label: string, actual: unknown, expected: unknown) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? [] : [`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`];

const EXPECTATIONS: Expectation[] = [
  { id: 'L1', title: 'El rubro lavandería activa órdenes de trabajo', kind: 'missing', check: (s) =>
    s.L1?.flags?.includes('ENABLE_WORK_ORDERS') ? [] : [`flags del rubro: ${JSON.stringify(s.L1?.flags)}`] },
  { id: 'L2', title: 'Recibe 3,5 kg + 2 prendas por S/ 47,50', check: (s) => [
    ...(ok(s.L2) ? [] : [`respondió ${s.L2?.result?.status}`]),
    ...eq('orden', s.L2?.order && { status: s.L2.order.status, total: s.L2.order.total }, { status: 'DRAFT', total: 47.5 }),
  ] },
  { id: 'L3', title: 'Cajero cobra precio de catálogo; el dueño puede cambiarlo', check: (s) => [
    ...eq('cajero, 3 kg', s.L3?.cashierTotal, 15),
    ...eq('dueño, 3 kg a S/ 4', s.L3?.ownerTotal, 12),
  ] },
  { id: 'L4', title: 'Rechaza media prenda', check: (s) =>
    (s.L4?.result?.status >= 400 && s.L4?.result?.status < 500) ? [] : [`respondió ${s.L4?.result?.status}`] },
  { id: 'L5', title: 'Recibido → En proceso → Listo', check: (s) => [
    ...eq('cambios', s.L5?.flow, ['APPROVED:200', 'IN_PROGRESS:200', 'READY:200']),
    ...eq('estado', s.L5?.order?.status, 'READY'),
  ] },
  { id: 'L6', title: 'No marca Entregado sin cobrar', check: (s) => [
    ...eq('respuesta', s.L6?.result?.status, 409),
    ...eq('estado', s.L6?.order?.status, 'APPROVED'),
  ] },
  { id: 'L7', title: 'Adelanto: entra a cuenta, no excede el total, uno solo si llegan juntos', check: (s) => [
    ...eq('adelanto de 20', s.L7?.first, { status: 201, balance: 27.5 }),
    ...eq('adelanto que excede', s.L7?.excess, 409),
    ...eq('orden', s.L7?.main?.advancePaid, 20),
    ...eq('adelantos simultáneos', s.L7?.racing, [201, 409]),
    ...eq('orden de 30', [s.L7?.pair?.advancePaid, s.L7?.paymentsOfPair], [20, 1]),
  ] },
  { id: 'L8', title: 'Express: recargo 50 % (o el configurado), fecha prometida y línea en la boleta', check: (s) => [
    ...eq('orden express', s.L8?.created, { status: 201, total: 37.5, surcharge: 12.5, promised: true }),
    ...eq('fecha pasada', s.L8?.pastDate, 400),
    ...eq('quitar y volver a poner express', s.L8?.toggle, { off: [200, 25], on: 37.5 }),
    ...eq('quitar express con adelanto 30 (> 25)', s.L8?.blockedOff, 409),
    ...eq('venta', s.L8?.sale, { status: 200, total: 37.5, lines: ['Lavado por kilo:10', 'Recargo express:12.5', 'Terno al seco:15'], linesSum: 37.5, change: 0 }),
    ...eq('boleta', s.L8?.boleta, { total: 37.5, tax: 5.72, lines: 3 }),
    ...eq('express al 40 % de 10', s.L8?.forty, 14),
  ] },
  { id: 'L9', title: 'Entrega cobra el saldo 27,50 (vuelto 2,50) y la venta queda por 47,50', check: (s) => [
    ...eq('pago menor al saldo', s.L9?.short, 400),
    ...eq('adelanto aplicado', s.L9?.advanceApplied, 20),
    ...(ok(s.L9) ? [] : [`respondió ${s.L9?.result?.status}: ${s.L9?.result?.error}`]),
    ...eq('orden', s.L9?.order && { status: s.L9.order.status, saleTotal: s.L9.order.saleTotal }, { status: 'CLOSED', saleTotal: 47.5 }),
    ...eq('vuelto', s.L9?.change, 2.5),
    ...eq('turno', s.L9?.shift, true),
  ] },
  // La venta guarda tax = 0 igual que el cobro del POS; el IGV se calcula al emitir.
  { id: 'L10', title: 'Boleta con IGV: base 40,25 + IGV 7,25', check: (s) =>
    eq('boleta', s.L10?.totals, { taxable: 40.25, tax: 7.25, total: 47.5 }) },
  { id: 'L11', title: 'Cobro doble simultáneo genera una sola venta', check: (s) => [
    ...eq('ventas de la orden', s.L11?.sales, 1),
    ...((s.L11?.statuses?.[0] === 200 && s.L11?.statuses?.[1] >= 400 && s.L11?.statuses?.[1] < 500) ? [] : [`respuestas: ${JSON.stringify(s.L11?.statuses)} (el segundo cobro debe recibir un rechazo claro)`]),
    ...eq('estado', s.L11?.order?.status, 'CLOSED'),
    ...eq('cobro con lectura vieja', [s.L11?.replay, s.L11?.salesAfterReplay], [409, 1]),
  ] },
  { id: 'L12', title: 'Caja cuenta adelanto y saldo una sola vez', check: (s) => [
    ...eq('efectivo del turno', s.L12?.cash, 77.5),
    ...eq('efectivo por método', s.L12?.byMethod?.CASH?.total, 77.5),
  ] },
  { id: 'L13', title: 'Anular la venta devuelve la orden a Listo y se puede volver a cobrar', check: (s) => [
    ...(ok(s.L13) ? [] : [`anulación respondió ${s.L13?.result?.status}`]),
    ...eq('tras anular', s.L13?.order && { status: s.L13.order.status, saleId: s.L13.order.saleId }, { status: 'READY', saleId: null }),
    ...eq('adelanto conservado', s.L13?.order?.advancePaid, 20),
    ...eq('nuevo cobro del saldo', s.L13?.recharge, 200),
    ...eq('final', s.L13?.final && { status: s.L13.final.status, saleTotal: s.L13.final.saleTotal }, { status: 'CLOSED', saleTotal: 47.5 }),
  ] },
  { id: 'L15', title: 'Cancelar con adelanto lo devuelve por método y la caja cuadra', check: (s) => [
    ...eq('respuesta', [s.L15?.status, s.L15?.refunded], [200, 25]),
    ...eq('orden', s.L15?.order && { status: s.L15.order.status, advancePaid: s.L15.order.advancePaid }, { status: 'CANCELLED', advancePaid: 0 }),
    ...eq('devoluciones', s.L15?.refunds, ['CASH:20', 'YAPE:5']),
    // 77,50 - 27,50 anulado + 27,50 recobrado + 21 de L14 - 20 devuelto
    ...eq('efectivo final', s.L15?.shift?.cash, 78.5),
    ...eq('Yape neto', s.L15?.shift?.byMethod?.YAPE?.total ?? 0, 0),
  ] },
  { id: 'L16', title: 'No deja el total por debajo del adelanto', check: (s) => [
    ...eq('respuesta', s.L16?.status, 409),
    ...eq('total', s.L16?.order?.total, 30),
  ] },
  { id: 'L17', title: 'Trabajo libre: el cajero escribe trabajo, kilos y total; boleta cuadra', check: (s) => [
    ...eq('creada', s.L17?.created, 201),
    ...eq('línea', s.L17?.item, { name: 'Lavado de ropa', content: '5 kg', qty: 1, subtotal: 25 }),
    ...eq('sin precio / sin descripción', s.L17?.rejected, [400, 400]),
    ...eq('venta', s.L17?.sale, { status: 200, name: 'Lavado de ropa', content: '5 kg', total: 25 }),
    ...eq('boleta', s.L17?.boletaTotal, 25),
  ] },
  { id: 'L18', title: 'Módulos por rubro: sin farmacia, completa órdenes y respeta lo apagado', check: (s) => [
    ...eq('módulos de lavandería', s.L18?.enable, ['ENABLE_SERVICES', 'ENABLE_WORK_ORDERS']),
    ...eq('apaga farmacia', s.L18?.disablesPharma, true),
    ...eq('no apaga los suyos', s.L18?.keepsOwn, true),
    ...eq('completa órdenes y no reactiva lo apagado', s.L18?.flags, { ENABLE_SERVICES: false, ENABLE_WORK_ORDERS: true }),
  ] },
  { id: 'L19', title: 'Precio del kilo de hoy: solo el dueño y sin borrar la configuración', check: (s) => [
    ...eq('cajero / inválido', [s.L19?.cashier, s.L19?.bad], [403, 400]),
    ...eq('dueño', s.L19?.ok, [200, 5.5]),
    ...eq('visible en la recepción', s.L19?.seen, 5.5),
    ...eq('RUC intacto', s.L19?.ruc, '20123456789'),
  ] },
  { id: 'L14', title: 'Producto de la orden descuenta stock con movimiento', check: (s) => [
    ...(ok(s.L14) ? [] : [`respondió ${s.L14?.result?.status}: ${s.L14?.result?.error}`]),
    ...eq('stock', s.L14?.stock, 3),
    ...eq('movimientos', s.L14?.moves, [-2]),
  ] },
];

// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-lavanderia-'));
  const dataDir = path.join(tempRoot, 'data');
  const port = await freePort();
  const url = `postgresql://postgres@127.0.0.1:${port}/lavanderia?schema=public`;
  let started = false;
  let db: PrismaClient | null = null;
  try {
    console.log('Lavandería: iniciando PostgreSQL desechable...');
    run(executable('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(executable('pg_ctl'), ['start', '-D', dataDir, '-l', path.join(tempRoot, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 });
    started = true;
    run(executable('createdb'), ['lavanderia'], { env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' } });
    run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });

    db = new PrismaClient({ datasources: { db: { url } } });
    const context = await seed(db);
    const contextPath = path.join(tempRoot, 'context.json');
    fs.writeFileSync(contextPath, JSON.stringify(context));

    console.log('Lavandería: ejecutando el flujo con los handlers reales...\n');
    const worker = spawnSync(process.execPath, [tsxCli, __filename, '--mode=flow', `--context=${contextPath}`], {
      cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true,
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, NODE_ENV: 'test' },
    });
    const line = String(worker.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT:'));
    if (worker.status !== 0 || !line) throw new Error(`Worker falló (${worker.status})\n${worker.stdout}${worker.stderr}`);
    const steps = JSON.parse(line.slice('RESULT:'.length)) as Steps;

    const groups: Record<Kind, string[]> = { defect: [], missing: [], rule: [] };
    const label: Record<Kind, string> = { defect: 'FAIL', missing: 'FALTA', rule: 'REGLA' };
    for (const expectation of EXPECTATIONS) {
      const problems = expectation.check(steps);
      const kind = expectation.kind ?? 'defect';
      console.log(`${problems.length ? label[kind] : 'PASS'} ${expectation.id} ${expectation.title}`);
      problems.forEach((p) => console.log(`       · ${p}`));
      if (problems.length) groups[kind].push(expectation.id);
    }
    const failed = groups.defect.length + groups.missing.length + groups.rule.length;
    console.log(`\nLavandería: ${EXPECTATIONS.length - failed}/${EXPECTATIONS.length} pasos correctos; defectos: ${groups.defect.join(', ') || 'ninguno'}; falta: ${groups.missing.join(', ') || 'nada'}; reglas por decidir: ${groups.rule.join(', ') || 'ninguna'}.`);
    if (process.argv.includes('--strict') && failed > 0) process.exitCode = 1;
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
