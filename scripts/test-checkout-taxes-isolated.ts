/**
 * Banco de pruebas de tributos en el cobro contra PostgreSQL real.
 *
 * Siembra productos gravados, exonerados, inafectos y una bolsa con ICBPER,
 * cobra con el handler real de checkout (efectivo, descuento global, fiado y
 * pago mixto) y comprueba total, ICBPER, vuelto, fiado y el snapshot de
 * tributos de cada línea. No usa la base del usuario, Supabase ni red.
 *
 * Uso: npx tsx scripts/test-checkout-taxes-isolated.ts
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
// Casos
// ──────────────────────────────────────────────────────────────────────────

type Sku = 'ARROZ' | 'PARA' | 'LIBRO' | 'BOLSA';
const PRICES: Record<Sku, number> = { ARROZ: 10, PARA: 2.5, LIBRO: 20, BOLSA: 0.1 };

interface LineExpect { sku: Sku; affectation: string; taxable: number; igv: number; icbperQty: number | null; icbper: number }
interface TaxCase {
  id: string;
  title: string;
  items: Array<{ sku: Sku; quantity: number }>;
  payment: Record<string, unknown>;
  expect:
    | { ok: true; total: number; icbperTotal: number; change?: number | null; receivable?: number; lines: LineExpect[] }
    | { ok: false; status: number };
}

const CASES: TaxCase[] = [
  {
    id: 'T1', title: 'Venta mixta en efectivo: gravado + exonerado + inafecto + 2 bolsas',
    items: [{ sku: 'ARROZ', quantity: 1 }, { sku: 'PARA', quantity: 2 }, { sku: 'LIBRO', quantity: 1 }, { sku: 'BOLSA', quantity: 2 }],
    payment: { paymentMethod: 'CASH', amountPaid: 40 },
    expect: {
      ok: true, total: 36.2, icbperTotal: 1, change: 3.8,
      lines: [
        { sku: 'ARROZ', affectation: 'GRAVADO', taxable: 8.47, igv: 1.53, icbperQty: null, icbper: 0 },
        { sku: 'PARA', affectation: 'EXONERADO', taxable: 5, igv: 0, icbperQty: null, icbper: 0 },
        { sku: 'LIBRO', affectation: 'INAFECTO', taxable: 20, igv: 0, icbperQty: null, icbper: 0 },
        { sku: 'BOLSA', affectation: 'GRAVADO', taxable: 0.17, igv: 0.03, icbperQty: 2, icbper: 1 },
      ],
    },
  },
  {
    id: 'T2', title: 'Rechaza efectivo que no cubre el ICBPER (paga 35.20 de 36.20)',
    items: [{ sku: 'ARROZ', quantity: 1 }, { sku: 'PARA', quantity: 2 }, { sku: 'LIBRO', quantity: 1 }, { sku: 'BOLSA', quantity: 2 }],
    payment: { paymentMethod: 'CASH', amountPaid: 35.2 },
    expect: { ok: false, status: 409 }, // AMOUNT_INSUFFICIENT
  },
  {
    id: 'T3', title: 'Venta solo gravada sin cambios (arroz S/10)',
    items: [{ sku: 'ARROZ', quantity: 1 }],
    payment: { paymentMethod: 'CASH', amountPaid: 10 },
    expect: { ok: true, total: 10, icbperTotal: 0, change: 0, lines: [{ sku: 'ARROZ', affectation: 'GRAVADO', taxable: 8.47, igv: 1.53, icbperQty: null, icbper: 0 }] },
  },
  {
    id: 'T4', title: 'Descuento global no reduce el ICBPER (arroz + bolsa − S/1)',
    items: [{ sku: 'ARROZ', quantity: 1 }, { sku: 'BOLSA', quantity: 1 }],
    payment: { paymentMethod: 'CASH', amountPaid: 9.6, discountTotal: 1 },
    expect: {
      ok: true, total: 9.6, icbperTotal: 0.5, change: 0,
      lines: [
        { sku: 'ARROZ', affectation: 'GRAVADO', taxable: 8.47, igv: 1.53, icbperQty: null, icbper: 0 },
        { sku: 'BOLSA', affectation: 'GRAVADO', taxable: 0.08, igv: 0.02, icbperQty: 1, icbper: 0.5 },
      ],
    },
  },
  {
    id: 'T5', title: 'Fiado con bolsa: la deuda incluye el ICBPER',
    items: [{ sku: 'PARA', quantity: 1 }, { sku: 'BOLSA', quantity: 1 }],
    payment: { paymentMethod: 'FIADO', useCustomer: true },
    expect: {
      ok: true, total: 3.1, icbperTotal: 0.5, receivable: 3.1,
      lines: [
        { sku: 'PARA', affectation: 'EXONERADO', taxable: 2.5, igv: 0, icbperQty: null, icbper: 0 },
        { sku: 'BOLSA', affectation: 'GRAVADO', taxable: 0.08, igv: 0.02, icbperQty: 1, icbper: 0.5 },
      ],
    },
  },
  {
    // Libro 20 + 2 bolsas 0.20 + ICBPER 1.00 = 21.20
    id: 'T6', title: 'Rechaza pago mixto que no cubre el ICBPER (paga 21.10 de 21.20)',
    items: [{ sku: 'LIBRO', quantity: 1 }, { sku: 'BOLSA', quantity: 2 }],
    payment: { paymentMethod: 'MIXED', paymentSplits: [{ method: 'YAPE', amount: 20 }, { method: 'CASH', amount: 1.1 }] },
    expect: { ok: false, status: 409 }, // AMOUNT_INSUFFICIENT
  },
  {
    id: 'T7', title: 'Pago mixto que cubre el ICBPER (Yape 20 + efectivo 1.20)',
    items: [{ sku: 'LIBRO', quantity: 1 }, { sku: 'BOLSA', quantity: 2 }],
    payment: { paymentMethod: 'MIXED', paymentSplits: [{ method: 'YAPE', amount: 20 }, { method: 'CASH', amount: 1.2 }] },
    expect: {
      ok: true, total: 21.2, icbperTotal: 1,
      lines: [
        { sku: 'LIBRO', affectation: 'INAFECTO', taxable: 20, igv: 0, icbperQty: null, icbper: 0 },
        { sku: 'BOLSA', affectation: 'GRAVADO', taxable: 0.17, igv: 0.03, icbperQty: 2, icbper: 1 },
      ],
    },
  },
];

// ──────────────────────────────────────────────────────────────────────────

async function seed(db: PrismaClient) {
  await db.unit.create({ data: { code: 'NIU', sunatCode: 'NIU', name: 'Unidad', symbol: 'und', allowDecimals: false, kind: 'GOODS' } });
  const niu = (await db.unit.findUniqueOrThrow({ where: { code: 'NIU' } })).id;
  const store = await db.store.create({ data: { name: 'Bodega Tributos', ruc: '20123456789', businessProfile: 'BOTICA' } });
  const storeId = store.id;
  await db.featureFlag.createMany({ data: (['ALLOW_FIADO'] as const).map((key) => ({ storeId, key, enabled: true })) });
  const owner = await db.user.create({ data: { storeId, email: 'owner@tributos.test', name: 'Dueña', password: 'x', role: 'OWNER' } });
  await db.shift.create({ data: { storeId, openedById: owner.id, openingCash: 50 } });
  const customer = await db.customer.create({ data: { storeId, name: 'Cliente Fiado', dni: '45678912' } });

  const defs: Array<{ sku: Sku; name: string; igvAffectation: 'GRAVADO' | 'EXONERADO' | 'INAFECTO'; icbper?: boolean }> = [
    { sku: 'ARROZ', name: 'Arroz Costeño 1kg', igvAffectation: 'GRAVADO' },
    { sku: 'PARA', name: 'Paracetamol 500mg', igvAffectation: 'EXONERADO' },
    { sku: 'LIBRO', name: 'Libro escolar', igvAffectation: 'INAFECTO' },
    { sku: 'BOLSA', name: 'Bolsa plástica', igvAffectation: 'GRAVADO', icbper: true },
  ];
  const storeProducts: Record<string, string> = {};
  for (const def of defs) {
    const master = await db.productMaster.create({ data: { internalSku: `TX-${def.sku}`, name: def.name, unitType: 'UNIT', baseUnitId: niu } });
    const sp = await db.storeProduct.create({
      data: { storeId, productId: master.id, price: PRICES[def.sku], stock: 1000, igvAffectation: def.igvAffectation, icbper: def.icbper ?? false },
    });
    storeProducts[def.sku] = sp.id;
  }
  return { storeId, ownerId: owner.id, customerId: customer.id, storeProducts };
}

async function salesWorker(contextPath: string) {
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const sessionPath = require.resolve('../src/lib/session');
  const session = { userId: context.ownerId, storeId: context.storeId, email: 'owner@tributos.test', name: 'Dueña', role: 'OWNER', isLoggedIn: true };
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

  const results: Record<string, unknown> = {};
  for (const [index, testCase] of CASES.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 2200)); // límite de 5 cobros por 10 s
    const { useCustomer, ...payment } = testCase.payment as Record<string, unknown> & { useCustomer?: boolean };
    const body = {
      items: testCase.items.map((item) => ({ storeProductId: context.storeProducts[item.sku], quantity: item.quantity, unitPrice: PRICES[item.sku] })),
      ...payment,
      ...(useCustomer ? { customerId: context.customerId } : {}),
    };
    const response = await POST(new NextRequest('http://127.0.0.1/api/sales/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': `tributos-${testCase.id}-${Date.now()}` },
      body: JSON.stringify(body),
    }));
    const payload = await response.json();
    const result: Record<string, unknown> = { status: response.status, code: payload.code, message: payload.message };
    if (response.ok) {
      const sale = await prisma.sale.findUnique({ where: { id: payload.saleId }, include: { items: { include: { storeProduct: { include: { product: true } } } }, receivable: true } });
      result.sale = {
        total: Number(sale.total),
        icbperTotal: Number(sale.icbperTotal),
        change: sale.changeAmount === null ? null : Number(sale.changeAmount),
        receivable: sale.receivable ? Number(sale.receivable.originalAmount) : null,
        lines: sale.items.map((item: Record<string, any>) => ({
          sku: String(item.storeProduct?.product?.internalSku).replace('TX-', ''),
          affectation: item.igvAffectation,
          taxable: item.taxableAmount === null ? null : Number(item.taxableAmount),
          igv: item.igvAmount === null ? null : Number(item.igvAmount),
          icbperQty: item.icbperQuantity === null ? null : Number(item.icbperQuantity),
          icbper: Number(item.icbperAmount),
        })),
      };
    }
    results[testCase.id] = result;
  }
  console.log(`RESULT:${JSON.stringify(results)}`);
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-tributos-'));
  const dataDir = path.join(tempRoot, 'data');
  const port = await freePort();
  const url = `postgresql://postgres@127.0.0.1:${port}/tributos?schema=public`;
  let started = false;
  let db: PrismaClient | null = null;
  try {
    console.log('Tributos: iniciando PostgreSQL desechable...');
    run(executable('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(executable('pg_ctl'), ['start', '-D', dataDir, '-l', path.join(tempRoot, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 });
    started = true;
    run(executable('createdb'), ['tributos'], { env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' } });
    run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });

    db = new PrismaClient({ datasources: { db: { url } } });
    const context = await seed(db);
    const contextPath = path.join(tempRoot, 'context.json');
    fs.writeFileSync(contextPath, JSON.stringify(context));

    console.log('Tributos: cobrando con el handler real de checkout...\n');
    const worker = spawnSync(process.execPath, [tsxCli, __filename, '--mode=sales', `--context=${contextPath}`], {
      cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true,
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, NODE_ENV: 'test' },
    });
    const line = String(worker.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT:'));
    if (worker.status !== 0 || !line) throw new Error(`Worker falló (${worker.status})\n${worker.stdout}${worker.stderr}`);
    const results = JSON.parse(line.slice('RESULT:'.length)) as Record<string, { status: number; code?: string; message?: string; sale?: any }>;

    let failed = 0;
    for (const testCase of CASES) {
      const result = results[testCase.id];
      const problems: string[] = [];
      const near = (a: number | null | undefined, b: number | null) => (a === null || a === undefined || b === null ? a === b : Math.abs(a - b) < 0.0005);
      if (testCase.expect.ok) {
        if (!result.sale) problems.push(`respondió ${result.status} ${result.code}: ${result.message}`);
        else {
          const sale = result.sale;
          const e = testCase.expect;
          if (!near(sale.total, e.total)) problems.push(`total ${sale.total} ≠ ${e.total}`);
          if (!near(sale.icbperTotal, e.icbperTotal)) problems.push(`ICBPER ${sale.icbperTotal} ≠ ${e.icbperTotal}`);
          if (e.change !== undefined && !near(sale.change, e.change)) problems.push(`vuelto ${sale.change} ≠ ${e.change}`);
          if (e.receivable !== undefined && !near(sale.receivable, e.receivable)) problems.push(`fiado ${sale.receivable} ≠ ${e.receivable}`);
          for (const expected of e.lines) {
            const actual = sale.lines.find((l: LineExpect) => l.sku === expected.sku);
            if (!actual) { problems.push(`falta la línea ${expected.sku}`); continue; }
            for (const key of ['affectation', 'taxable', 'igv', 'icbperQty', 'icbper'] as const) {
              const ok = typeof expected[key] === 'string' ? actual[key] === expected[key] : near(actual[key], expected[key] as number | null);
              if (!ok) problems.push(`${expected.sku}.${key} ${actual[key]} ≠ ${expected[key]}`);
            }
          }
        }
      } else if (result.status !== testCase.expect.status) {
        problems.push(`respondió ${result.status}${result.code ? ` ${result.code}` : ''}, se esperaba ${testCase.expect.status}`);
      }
      if (problems.length) failed++;
      console.log(`${problems.length ? 'FAIL' : 'PASS'} ${testCase.id} ${testCase.title}`);
      problems.forEach((p) => console.log(`       · ${p}`));
    }
    console.log(`\nTributos en el cobro: ${CASES.length - failed}/${CASES.length} casos correctos.`);
    if (failed > 0) process.exitCode = 1;
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
