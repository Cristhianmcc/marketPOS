/**
 * Banco de pruebas de ventas fraccionadas (ferretería) contra PostgreSQL real.
 *
 * Levanta el PostgreSQL incluido en una carpeta temporal, siembra una
 * ferretería con productos por metro, kilo, unidad y caja, ejecuta el handler
 * real de checkout para cada caso y comprueba respuesta, stock, movimientos,
 * detalle de venta y la línea UBL que se enviaría a SUNAT. No usa la base del
 * usuario, Supabase ni red.
 *
 * Uso: npx tsx scripts/test-ferreteria-units-isolated.ts
 */
import assert from 'node:assert/strict';
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
// Casos: cada uno declara lo que el sistema DEBE hacer.
// ──────────────────────────────────────────────────────────────────────────

interface SaleCase {
  id: string;
  title: string;
  sku: string;
  quantity: number;
  saleUnit?: string; // código de unidad de venta; sin él se vende en unidad base
  expect:
    | { ok: true; total: number; baseQty: number; stockAfter: number }
    | { ok: false; status: number; stockAfter: number };
  /** Regla de negocio discutible: se informa aparte de los defectos. */
  businessRule?: boolean;
}

const CASES: SaleCase[] = [
  { id: 'A1', title: 'Cable por metro con decimales (2.5 m)', sku: 'FT-CABLE', quantity: 2.5,
    expect: { ok: true, total: 5.5, baseQty: 2.5, stockAfter: 497.5 } },
  { id: 'A2', title: 'Clavos por kilo con decimales (1.25 kg)', sku: 'FT-CLAVO', quantity: 1.25,
    expect: { ok: true, total: 10, baseQty: 1.25, stockAfter: 24.25 } },
  { id: 'A3', title: 'Tornillos por caja sin precio especial (2 cajas = 200 u)', sku: 'FT-TORN', quantity: 2, saleUnit: 'BX',
    expect: { ok: true, total: 60, baseQty: 200, stockAfter: 800 } },
  { id: 'A4', title: 'Cable por rollo con precio especial (1 rollo = 100 m a S/200)', sku: 'FT-CABLE', quantity: 1, saleUnit: 'BX',
    expect: { ok: true, total: 200, baseQty: 100, stockAfter: 397.5 } },
  { id: 'A5', title: 'Cable en centímetros (150 cm = 1.5 m)', sku: 'FT-CABLE', quantity: 150, saleUnit: 'CMT',
    expect: { ok: true, total: 3.3, baseQty: 1.5, stockAfter: 396 } },
  { id: 'A6', title: 'Cinta en centímetros con poco stock (150 cm de 2 m)', sku: 'FT-CINTA', quantity: 150, saleUnit: 'CMT',
    expect: { ok: true, total: 6, baseQty: 1.5, stockAfter: 0.5 } },
  { id: 'A7', title: 'Redondeo: 0.333 m de cable', sku: 'FT-CABLE', quantity: 0.333,
    expect: { ok: true, total: 0.73, baseQty: 0.333, stockAfter: 395.667 } },
  { id: 'B1', title: 'Rechaza cajas que superan el stock (9 cajas = 900 u de 800)', sku: 'FT-TORN', quantity: 9, saleUnit: 'BX',
    expect: { ok: false, status: 409, stockAfter: 800 } },
  { id: 'B2', title: 'Rechaza fracción de producto por unidad (0.5 u)', sku: 'FT-TORN', quantity: 0.5,
    expect: { ok: false, status: 400, stockAfter: 800 } },
  { id: 'B3', title: 'Rechaza más bolsas que el stock (4 de 3)', sku: 'FT-CEM', quantity: 4,
    expect: { ok: false, status: 409, stockAfter: 3 } },
  { id: 'B4', title: 'Rechaza fracción de caja (0.5 rollo) aunque el metro admita decimales', sku: 'FT-CABLE', quantity: 0.5, saleUnit: 'BX',
    expect: { ok: false, status: 400, stockAfter: 395.667 } },
  { id: 'A8', title: 'Venta mínima en centímetros (2 cm = 0.02 m) con poco stock', sku: 'FT-CINTA', quantity: 2, saleUnit: 'CMT',
    expect: { ok: true, total: 0.08, baseQty: 0.02, stockAfter: 0.48 } },
  { id: 'B6', title: 'Rechaza rollos de cable que superan el stock (4 rollos = 400 m de 395.667)', sku: 'FT-CABLE', quantity: 4, saleUnit: 'BX',
    expect: { ok: false, status: 409, stockAfter: 395.667 } },
];

/** Línea UBL esperada para SUNAT: unidad, cantidad y precio con IGV. */
const SUNAT_LINES: Record<string, { unitCode: string; quantity: number; price: number }> = {
  A1: { unitCode: 'MTR', quantity: 2.5, price: 2.2 },
  A3: { unitCode: 'NIU', quantity: 200, price: 0.3 },
  A4: { unitCode: 'BX', quantity: 1, price: 200 },
  A5: { unitCode: 'MTR', quantity: 1.5, price: 2.2 },
};
const SUNAT_CASES = Object.keys(SUNAT_LINES);

// ──────────────────────────────────────────────────────────────────────────
// Siembra
// ──────────────────────────────────────────────────────────────────────────

async function seed(db: PrismaClient) {
  const units = [
    { code: 'NIU', sunatCode: 'NIU', name: 'Unidad', symbol: 'und', allowDecimals: false },
    { code: 'MTR', sunatCode: 'MTR', name: 'Metro', symbol: 'm', allowDecimals: true },
    { code: 'CMT', sunatCode: 'CMT', name: 'Centímetro', symbol: 'cm', allowDecimals: true },
    { code: 'KGM', sunatCode: 'KGM', name: 'Kilogramo', symbol: 'kg', allowDecimals: true },
    { code: 'BX', sunatCode: 'BX', name: 'Caja', symbol: 'cja', allowDecimals: false },
  ];
  for (const unit of units) await db.unit.create({ data: { ...unit, kind: 'GOODS' } });
  const unitId = async (code: string) => (await db.unit.findUniqueOrThrow({ where: { code } })).id;

  const store = await db.store.create({ data: { name: 'Ferretería Prueba', ruc: '20123456789', address: 'Av. Prueba 1', businessProfile: 'FERRETERIA' } });
  const storeId = store.id;
  await db.featureFlag.createMany({
    data: (['ENABLE_ADVANCED_UNITS', 'ENABLE_CONVERSIONS', 'ENABLE_SELLUNIT_PRICING', 'ENABLE_SUNAT'] as const)
      .map((key) => ({ storeId, key, enabled: true })),
  });
  await db.sunatSettings.create({
    data: { storeId, enabled: true, env: 'BETA', ruc: '20123456789', razonSocial: 'FERRETERIA PRUEBA S.A.C.', address: 'Av. Prueba 1', ubigeo: '150101' },
  });
  const owner = await db.user.create({ data: { storeId, email: 'owner@ferreteria.test', name: 'Dueño', password: 'x', role: 'OWNER' } });
  await db.shift.create({ data: { storeId, openedById: owner.id, openingCash: 100 } });

  const products: Array<{ sku: string; name: string; unit: string; unitType: 'UNIT' | 'KG'; price: number; stock: number }> = [
    { sku: 'FT-CABLE', name: 'Cable THW 14', unit: 'MTR', unitType: 'UNIT', price: 2.2, stock: 500 },
    { sku: 'FT-CINTA', name: 'Cinta aislante', unit: 'MTR', unitType: 'UNIT', price: 4, stock: 2 },
    { sku: 'FT-CLAVO', name: 'Clavo 2 pulgadas', unit: 'KGM', unitType: 'KG', price: 8, stock: 25.5 },
    { sku: 'FT-TORN', name: 'Tornillo 1/4', unit: 'NIU', unitType: 'UNIT', price: 0.3, stock: 1000 },
    { sku: 'FT-CEM', name: 'Cemento bolsa 42.5 kg', unit: 'NIU', unitType: 'UNIT', price: 32, stock: 3 },
  ];
  const masters: Record<string, string> = {};
  const storeProducts: Record<string, string> = {};
  for (const p of products) {
    const master = await db.productMaster.create({ data: { internalSku: p.sku, name: p.name, unitType: p.unitType, baseUnitId: await unitId(p.unit) } });
    const sp = await db.storeProduct.create({ data: { storeId, productId: master.id, price: p.price, stock: p.stock } });
    masters[p.sku] = master.id;
    storeProducts[p.sku] = sp.id;
  }

  const conversion = async (sku: string, from: string, to: string, factor: number) =>
    db.unitConversion.create({ data: { storeId, productMasterId: masters[sku], fromUnitId: await unitId(from), toUnitId: await unitId(to), factorToBase: factor } });
  await conversion('FT-CABLE', 'BX', 'MTR', 100);
  await conversion('FT-CABLE', 'CMT', 'MTR', 0.01);
  await conversion('FT-CINTA', 'CMT', 'MTR', 0.01);
  await conversion('FT-TORN', 'BX', 'NIU', 100);
  await db.sellUnitPrice.create({ data: { storeId, productMasterId: masters['FT-CABLE'], sellUnitId: await unitId('BX'), price: 200 } });

  return { storeId, ownerId: owner.id, storeProducts, unitIds: Object.fromEntries(await Promise.all(units.map(async (u) => [u.code, await unitId(u.code)]))) };
}

// ──────────────────────────────────────────────────────────────────────────
// Worker: ejecuta el checkout real y arma la línea UBL de SUNAT.
// ──────────────────────────────────────────────────────────────────────────

async function salesWorker(contextPath: string) {
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const sessionPath = require.resolve('../src/lib/session');
  const session = { userId: context.ownerId, storeId: context.storeId, email: 'owner@ferreteria.test', name: 'Dueño', role: 'OWNER', isLoggedIn: true };
  require.cache[sessionPath] = {
    id: sessionPath, filename: sessionPath, loaded: true,
    exports: { getCurrentStoreUser: async () => session, getStoreSessionOrThrow: async () => session, getSession: async () => session },
  } as NodeJS.Module;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextRequest } = require('next/server');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { POST } = require('../src/app/api/sales/checkout/route');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require('../src/infra/db/prisma');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildPayloadFromSale } = require('../src/lib/sunat/buildPayloadFromSale');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateInvoiceXML } = require('../src/lib/sunat/ubl/invoice');

  const results: Record<string, unknown> = {};
  for (const [index, testCase] of (CASES as SaleCase[]).entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 2200)); // límite de 5 cobros por 10 s
    const body = {
      items: [{
        storeProductId: context.storeProducts[testCase.sku],
        quantity: testCase.quantity,
        unitPrice: context.prices[testCase.sku],
        ...(testCase.saleUnit ? { saleUnitId: context.unitIds[testCase.saleUnit] } : {}),
      }],
      paymentMethod: 'CASH',
      amountPaid: 1000, // el POS siempre envía el monto recibido en efectivo
    };
    const response = await POST(new NextRequest('http://127.0.0.1/api/sales/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': `ferreteria-${testCase.id}-${Date.now()}` },
      body: JSON.stringify(body),
    }));
    const payload = await response.json();
    const result: Record<string, unknown> = { status: response.status, code: payload.code, message: payload.message, saleId: payload.saleId };

    // Estado inmediatamente después de este cobro (los casos comparten productos).
    const storeProductId = context.storeProducts[testCase.sku];
    const after = await prisma.storeProduct.findUnique({ where: { id: storeProductId }, select: { stock: true } });
    result.stockAfter = Number(after?.stock);
    if (response.ok) {
      const sale = await prisma.sale.findUnique({ where: { id: payload.saleId }, include: { items: true } });
      const movement = await prisma.movement.findFirst({ where: { storeProductId, type: 'SALE' }, orderBy: { createdAt: 'desc' } });
      result.saleTotal = Number(sale?.total);
      result.itemQuantity = Number(sale?.items[0]?.quantity);
      result.movementQuantity = movement ? Number(movement.quantity) : null;
    }

    if (response.ok && SUNAT_CASES.includes(testCase.id)) {
      const document = await buildPayloadFromSale(prisma, { saleId: payload.saleId, docType: 'BOLETA' });
      const xml: string = generateInvoiceXML(document, 'B001-1');
      const quantity = xml.match(/<cbc:InvoicedQuantity unitCode="([^"]+)">([^<]+)</);
      const price = xml.match(/<cac:AlternativeConditionPrice>\s*<cbc:PriceAmount[^>]*>([^<]+)</);
      result.ubl = {
        unitCode: quantity?.[1],
        quantity: Number(quantity?.[2]),
        priceWithIgv: Number(price?.[1]),
        payable: document.totals.total,
      };
    }
    results[testCase.id] = result;
  }
  console.log(`RESULT:${JSON.stringify(results)}`);
}

// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-ferreteria-'));
  const dataDir = path.join(tempRoot, 'data');
  const port = await freePort();
  const url = `postgresql://postgres@127.0.0.1:${port}/ferreteria?schema=public`;
  let started = false;
  let db: PrismaClient | null = null;

  try {
    console.log('Ferretería: iniciando PostgreSQL desechable...');
    run(executable('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(executable('pg_ctl'), ['start', '-D', dataDir, '-l', path.join(tempRoot, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 });
    started = true;
    run(executable('createdb'), ['ferreteria'], { env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' } });
    run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });

    db = new PrismaClient({ datasources: { db: { url } } });
    const context = await seed(db);
    const prices = { 'FT-CABLE': 2.2, 'FT-CINTA': 4, 'FT-CLAVO': 8, 'FT-TORN': 0.3, 'FT-CEM': 32 };
    const contextPath = path.join(tempRoot, 'context.json');
    fs.writeFileSync(contextPath, JSON.stringify({ ...context, prices }));

    console.log('Ferretería: cobrando con el handler real de checkout...\n');
    const worker = spawnSync(process.execPath, [tsxCli, __filename, '--mode=sales', `--context=${contextPath}`], {
      cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true,
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, NODE_ENV: 'test' },
    });
    const line = String(worker.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT:'));
    if (worker.status !== 0 || !line) throw new Error(`Worker falló (${worker.status})\n${worker.stdout}${worker.stderr}`);
    const results = JSON.parse(line.slice('RESULT:'.length)) as Record<string, {
      status: number; code?: string; message?: string; saleId?: string; stockAfter: number;
      saleTotal?: number; itemQuantity?: number; movementQuantity?: number | null;
      ubl?: { unitCode: string; quantity: number; priceWithIgv: number; payable: number };
    }>;

    const defects: string[] = [];
    const ruleIssues: string[] = [];
    for (const testCase of CASES) {
      const result = results[testCase.id];
      const problems: string[] = [];

      if (testCase.expect.ok) {
        if (result.status !== 201 && result.status !== 200) problems.push(`respondió ${result.status} ${result.code}: ${result.message}`);
        else {
          const total = result.saleTotal!;
          if (Math.abs(total - testCase.expect.total) > 0.001) problems.push(`total S/${total} ≠ S/${testCase.expect.total}`);
          if (Math.abs(result.itemQuantity! - testCase.expect.baseQty) > 0.0005) problems.push(`cantidad guardada ${result.itemQuantity} ≠ ${testCase.expect.baseQty}`);
          if (result.movementQuantity == null || Math.abs(result.movementQuantity + testCase.expect.baseQty) > 0.0005) {
            problems.push(`movimiento ${result.movementQuantity ?? 'ausente'} ≠ -${testCase.expect.baseQty}`);
          }
          if (Math.abs(total * 100 - Math.round(total * 100)) > 1e-6) problems.push('total con más de 2 decimales');
        }
      } else if (result.status !== testCase.expect.status) {
        problems.push(`respondió ${result.status}${result.code ? ` ${result.code}` : ''}, se esperaba ${testCase.expect.status}`);
      }
      if (Math.abs(result.stockAfter - testCase.expect.stockAfter) > 0.0005) problems.push(`stock ${result.stockAfter} ≠ ${testCase.expect.stockAfter}`);

      // Línea SUNAT: unidad base y precio unitario coherente con el importe.
      const expectedLine = SUNAT_LINES[testCase.id];
      if (expectedLine && !result.ubl) problems.push('no se generó la línea SUNAT');
      if (result.ubl) {
        const { unitCode, quantity, priceWithIgv, payable } = result.ubl;
        if (unitCode !== expectedLine.unitCode) problems.push(`SUNAT unidad ${unitCode} ≠ ${expectedLine.unitCode}`);
        if (Math.abs(quantity - expectedLine.quantity) > 0.0005) problems.push(`SUNAT cantidad ${quantity} ≠ ${expectedLine.quantity}`);
        if (Math.abs(priceWithIgv - expectedLine.price) > 0.001) problems.push(`SUNAT precio ${priceWithIgv} ≠ ${expectedLine.price}`);
        if (Math.abs(quantity * priceWithIgv - payable) > 0.011) {
          problems.push(`SUNAT: ${quantity} × precio ${priceWithIgv} = ${(quantity * priceWithIgv).toFixed(2)} ≠ importe ${payable}`);
        }
      }

      const ok = problems.length === 0;
      console.log(`${ok ? 'PASS' : testCase.businessRule ? 'REGLA' : 'FAIL'} ${testCase.id} ${testCase.title}`);
      problems.forEach((p) => console.log(`       · ${p}`));
      if (!ok) (testCase.businessRule ? ruleIssues : defects).push(testCase.id);
    }

    const passed = CASES.length - defects.length - ruleIssues.length;
    console.log(`\nFerretería: ${passed}/${CASES.length} casos correctos; defectos: ${defects.join(', ') || 'ninguno'}; reglas por decidir: ${ruleIssues.join(', ') || 'ninguna'}.`);
    assert.ok(Object.keys(results).length === CASES.length, 'el worker ejecutó todos los casos');
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
(mode === 'sales' ? salesWorker(contextArg) : main()).then(
  () => { if (mode) process.exit(0); },
  (error) => { console.error((error as Error).stack || error); process.exit(1); },
);
