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
  return { storeId, ownerId: owner.id, shiftId: shift.id, customerId: customer.id, kilo: kilo.id, terno: terno.id, units: { niu, kgm } };
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
  const cancel = require('../src/app/api/sales/[id]/cancel/route');
  const { getProfileFlags } = require('../src/lib/businessProfiles');
  const { PrismaShiftRepository } = require('../src/infra/db/repositories/PrismaShiftRepository');
  const { buildPayloadFromSale } = require('../src/lib/sunat/buildPayloadFromSale');
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
    return o ? { status: o.status, total: Number(o.total), saleId: o.saleId, saleTotal: o.sale ? Number(o.sale.total) : null } : null;
  };

  const steps: Record<string, unknown> = {};

  // L1 El rubro lavandería trae órdenes de trabajo (seguimiento de prendas)
  steps.L1 = { flags: getProfileFlags('LAVANDERIA') };

  // L2 Recepción: 3,5 kg de lavado (S/ 5/kg) + 2 ternos (S/ 15) = S/ 47,50
  const main = await create([kiloItem(3.5), ternoItem(2)], { notes: 'Camisa blanca con mancha' });
  const mainId = main.body?.data?.id;
  steps.L2 = { result: { status: main.status }, order: mainId ? await orderState(mainId) : null };

  // L3 Precio enviado por el cliente distinto al del catálogo (S/ 1 el kilo)
  const cheap = await create([kiloItem(3, 1)]);
  steps.L3 = { result: { status: cheap.status }, total: cheap.body?.data ? Number(cheap.body.data.total) : null };

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

  // L7 Adelanto al recibir: S/ 20 a cuenta que entra a la caja del turno
  steps.L7 = {
    paymentModel: typeof prisma.workOrderPayment?.create === 'function',
    advanceField: 'advanceApplied' in (prisma.sale.fields ?? {}),
  };

  // L8 Recargo express en la orden
  steps.L8 = { expressField: 'express' in (prisma.workOrder.fields ?? {}) };

  // L9 Entrega: cobro en efectivo de S/ 50 por la orden de S/ 47,50
  const paid = await charge(mainId, { paymentMethod: 'CASH', amountPaid: 50 });
  const sale = paid.body?.data?.saleId ? await prisma.sale.findUnique({ where: { id: paid.body.data.saleId }, include: { items: true } }) : null;
  steps.L9 = {
    result: { status: paid.status, error: paid.body?.error },
    order: await orderState(mainId),
    change: sale ? Number(sale.changeAmount) : null,
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
  await setStatus(twiceId, 'READY');
  const both = await Promise.all([
    charge(twiceId, { paymentMethod: 'CASH', amountPaid: 10 }),
    charge(twiceId, { paymentMethod: 'CASH', amountPaid: 10 }),
  ]);
  const salesForTwice = await prisma.saleItem.count({ where: { serviceId: ctx.kilo, quantity: 2, sale: { total: { gt: 0 } } } });
  steps.L11 = { statuses: both.map((b) => b.status).sort(), sales: salesForTwice, order: await orderState(twiceId) };

  // L12 Caja del turno: 100 inicial + ventas en efectivo
  const shiftRepo = new PrismaShiftRepository();
  const cashSales = await shiftRepo.getCashSalesTotal(ctx.shiftId);
  const cashSaleSum = (await prisma.sale.aggregate({ where: { shiftId: ctx.shiftId, paymentMethod: 'CASH', total: { gt: 0 } }, _sum: { total: true } }))._sum.total;
  steps.L12 = { cashSales, cashSaleSum: Number(cashSaleSum ?? 0) };

  // L13 Anular la venta de una orden entregada
  const cancelled = sale ? await read(await cancel.POST(json(`/api/sales/${sale.id}/cancel`, 'POST', {}), { params: Promise.resolve({ id: sale.id }) })) : null;
  steps.L13 = { result: cancelled ? { status: cancelled.status } : null, order: await orderState(mainId) };

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
  { id: 'L3', title: 'El precio sale del catálogo, no del cliente', kind: 'rule', check: (s) =>
    eq('total de 3 kg', s.L3?.total, 15) },
  { id: 'L4', title: 'Rechaza media prenda', check: (s) =>
    (s.L4?.result?.status >= 400 && s.L4?.result?.status < 500) ? [] : [`respondió ${s.L4?.result?.status}`] },
  { id: 'L5', title: 'Recibido → En proceso → Listo', check: (s) => [
    ...eq('cambios', s.L5?.flow, ['APPROVED:200', 'IN_PROGRESS:200', 'READY:200']),
    ...eq('estado', s.L5?.order?.status, 'READY'),
  ] },
  { id: 'L6', title: 'No marca Entregado sin cobrar', check: (s) => [
    ...(s.L6?.result?.status >= 400 ? [] : [`respondió ${s.L6?.result?.status}`]),
    ...eq('estado', s.L6?.order?.status, 'APPROVED'),
  ] },
  { id: 'L7', title: 'Adelanto al recibir', kind: 'missing', check: (s) => [
    ...(s.L7?.paymentModel ? [] : ['no existe registro de pagos de la orden']),
    ...(s.L7?.advanceField ? [] : ['la venta no guarda el adelanto aplicado']),
  ] },
  { id: 'L8', title: 'Recargo express', kind: 'missing', check: (s) =>
    s.L8?.expressField ? [] : ['la orden no tiene recargo express'] },
  { id: 'L9', title: 'Entrega cobra S/ 47,50, vuelto 2,50 y cierra la orden', check: (s) => [
    ...(ok(s.L9) ? [] : [`respondió ${s.L9?.result?.status}: ${s.L9?.result?.error}`]),
    ...eq('orden', s.L9?.order && { status: s.L9.order.status, saleTotal: s.L9.order.saleTotal }, { status: 'CLOSED', saleTotal: 47.5 }),
    ...eq('vuelto', s.L9?.change, 2.5),
    ...eq('turno', s.L9?.shift, true),
  ] },
  { id: 'L10', title: 'Venta y boleta con IGV: base 40,25 + IGV 7,25', check: (s) => [
    ...eq('IGV de la venta', s.L10?.saleTax, 7.25),
    ...eq('suma de IGV por línea', Math.round((s.L10?.items ?? []).reduce((t: number, i: any) => t + (i.igv ?? 0), 0) * 100) / 100, 7.25),
    ...eq('boleta', s.L10?.totals, { taxable: 40.25, tax: 7.25, total: 47.5 }),
  ] },
  { id: 'L11', title: 'Cobro doble simultáneo genera una sola venta', check: (s) => [
    ...eq('ventas de la orden', s.L11?.sales, 1),
    ...((s.L11?.statuses?.[0] === 200 && s.L11?.statuses?.[1] >= 400 && s.L11?.statuses?.[1] < 500) ? [] : [`respuestas: ${JSON.stringify(s.L11?.statuses)} (el segundo cobro debe recibir un rechazo claro)`]),
    ...eq('estado', s.L11?.order?.status, 'CLOSED'),
  ] },
  { id: 'L12', title: 'Caja del turno suma las ventas en efectivo', check: (s) =>
    eq('efectivo del turno', s.L12?.cashSales, s.L12?.cashSaleSum) },
  { id: 'L13', title: 'Anular la venta no deja la orden como entregada', kind: 'rule', check: (s) => [
    ...(ok(s.L13) ? [] : [`anulación respondió ${s.L13?.result?.status}`]),
    ...(s.L13?.order?.status === 'CLOSED' ? [`la orden sigue ${s.L13.order.status} con la venta anulada`] : []),
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
