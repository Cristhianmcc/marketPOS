/**
 * Banco de pruebas de Perfumería contra PostgreSQL real.
 *
 * Con los handlers reales: importa fragancias del catálogo de referencia y
 * las presentaciones, busca, vende "fragancia + presentación" (precio del
 * servidor, ml de esencia y envase), arma la boleta, rechaza ventas sin
 * esencia o sin envase, aplica descuento, anula devolviendo esencia y envase,
 * exporta el catálogo y comprueba el respaldo. Fase 2: extras en la línea,
 * rellenos con compra previa, 2x1, packs con regalo, reporte de consumo y
 * catálogo web con atributos. No usa la base del usuario, Supabase ni red.
 *
 * Uso: npx tsx scripts/test-perfumeria-flow-isolated.ts [--strict]
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
const catalogPath = path.join(root, 'data', 'perfumeria', 'perfumarte-catalogo.json');
const executable = (name: string) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const SAMPLE_CODES = ['F754', 'M1141', 'F111', 'M1025', 'F1322'];
const INTERNAL_TOKEN = 'perfumeria-internal-token-with-more-than-32-characters';

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

async function seed(db: PrismaClient) {
  const store = await db.store.create({ data: { name: 'Perfumería Sede Prueba', ruc: '20123456789', businessProfile: 'PERFUMERIA' } });
  const other = await db.store.create({ data: { name: 'Bodega Vecina', businessProfile: 'BODEGA' } });
  await db.featureFlag.create({ data: { storeId: store.id, key: 'ENABLE_SUNAT', enabled: true } });
  await db.sunatSettings.create({
    data: { storeId: store.id, enabled: true, env: 'BETA', ruc: '20123456789', razonSocial: 'PERFUMERIA PRUEBA S.A.C.', address: 'Jr. Aroma 1', ubigeo: '150101' },
  });
  const owner = await db.user.create({ data: { storeId: store.id, email: 'dueno@perfumeria.test', name: 'Dueño', password: 'x', role: 'OWNER' } });
  const otherOwner = await db.user.create({ data: { storeId: other.id, email: 'dueno@bodega.test', name: 'Bodeguero', password: 'x', role: 'OWNER' } });
  await db.shift.create({ data: { storeId: store.id, openedById: owner.id, openingCash: 100 } });
  return { storeId: store.id, ownerId: owner.id, otherStoreId: other.id, otherOwnerId: otherOwner.id };
}

async function flowWorker(contextPath: string) {
  const ctx = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const sessionPath = require.resolve('../src/lib/session');
  const session: Record<string, unknown> = { userId: ctx.ownerId, storeId: ctx.storeId, email: 'dueno@perfumeria.test', name: 'Dueño', role: 'OWNER', isLoggedIn: true };
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
  const importRoute = require('../src/app/api/perfumery/import/route');
  const exportRoute = require('../src/app/api/perfumery/export/route');
  const fragrancesRoute = require('../src/app/api/perfumery/fragrances/route');
  const presentationsRoute = require('../src/app/api/perfumery/presentations/route');
  const presentationRoute = require('../src/app/api/perfumery/presentations/[id]/route');
  const checkout = require('../src/app/api/sales/checkout/route');
  const cancel = require('../src/app/api/sales/[id]/cancel/route');
  const backupExport = require('../src/app/api/backups/export/route');
  const extrasRoute = require('../src/app/api/perfumery/extras/route');
  const packsRoute = require('../src/app/api/perfumery/packs/route');
  const historyRoute = require('../src/app/api/perfumery/customer-history/route');
  const reportRoute = require('../src/app/api/perfumery/report/route');
  const catalogPublishRoute = require('../src/app/api/perfumery/catalog-publish/route');
  const { perfumeCatalogEntries } = require('../src/lib/perfumery/catalogPublish');
  const { CatalogPublishService } = require('../src/modules/catalog/backend/services/catalog-publish.service');
  const { CatalogController } = require('../src/modules/catalog/backend/controllers/catalog.controller');
  const restoreRoute = require('../src/app/api/backups/restore/new-store/route');
  const { buildPayloadFromSale } = require('../src/lib/sunat/buildPayloadFromSale');
  const { generateInvoiceXML } = require('../src/lib/sunat/ubl/invoice');
  const { getAvailableProfiles, getDefaultCategoriesForProfile } = require('../src/lib/businessProfiles');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const json = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(`http://127.0.0.1${url}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const read = async (response: Response) => ({ status: response.status, body: await response.json().catch(() => null) });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const asOwner = () => Object.assign(session, { role: 'OWNER', userId: ctx.ownerId, storeId: ctx.storeId });

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sample = catalog.fragrances.filter((f: { code: string }) => SAMPLE_CODES.includes(f.code));
  const steps: Record<string, any> = {};

  steps.P0 = { profile: getAvailableProfiles().includes('PERFUMERIA'), categories: getDefaultCategoriesForProfile('PERFUMERIA').map((c: any) => c.name) };

  // P1 Importación: cajero no; otra tienda sin rubro no; dueño sí (300 ml y 2 envases).
  session.role = 'CASHIER';
  const cashierImport = await read(await importRoute.POST(json('/api/perfumery/import', 'POST', { fragrances: sample })));
  Object.assign(session, { role: 'OWNER', userId: ctx.otherOwnerId, storeId: ctx.otherStoreId });
  const otherImport = await read(await importRoute.POST(json('/api/perfumery/import', 'POST', { fragrances: sample })));
  asOwner();
  const badImport = await read(await importRoute.POST(json('/api/perfumery/import', 'POST', { fragrances: [{ code: 'F 1' }, { code: '??' }] })));
  const first = await read(await importRoute.POST(json('/api/perfumery/import', 'POST', {
    fragrances: sample, useDefaultPresentations: true, initialStockMl: 300, initialContainerStock: 2,
  })));
  const again = await read(await importRoute.POST(json('/api/perfumery/import', 'POST', { fragrances: sample, initialStockMl: 999 })));
  const csv = await read(await importRoute.POST(json('/api/perfumery/import', 'POST', {
    csv: 'codigo;perfume;marca;genero;familia;stock_ml\nM9001;Prueba CSV;Casa;hombre;Cítrico Marino;150\n',
  })));
  steps.P1 = {
    cashier: cashierImport.status, otherStore: otherImport.status, bad: badImport.status,
    first: first.body?.result, again: again.body?.result, csv: csv.body?.result,
    unchangedStock: Number((await prisma.fragrance.findFirst({ where: { storeId: ctx.storeId, code: 'F754' }, include: { storeProduct: true } }))?.storeProduct.stock),
  };

  // P2 Búsqueda y filtros
  const search = async (query: string) => (await read(await fragrancesRoute.GET(json(`/api/perfumery/fragrances?${query}`, 'GET')))).body;
  const all = await search('');
  const jadore = await search('q=jadore');
  const accents = await search('q=sauvage%20dior');
  const dior = await search('q=dior');
  const men = await search('gender=hombre');
  const presentations = (await read(await presentationsRoute.GET(json('/api/perfumery/presentations', 'GET')))).body?.presentations ?? [];
  const byCode = Object.fromEntries((all?.fragrances ?? []).map((f: any) => [f.code, f]));
  const pres = Object.fromEntries(presentations.map((p: any) => [p.name, p]));
  steps.P2 = {
    total: all?.fragrances?.length, jadore: jadore?.fragrances?.map((f: any) => f.code), dior: dior?.fragrances?.map((f: any) => f.code).sort(),
    men: men?.fragrances?.map((f: any) => f.code).sort(), names: byCode.F754?.name, stock: byCode.F754?.stockMl,
    accents: accents?.fragrances?.map((f: any) => f.code), presentations: presentations.length, azul: pres['100 ml Azul'] && { price: pres['100 ml Azul'].price, ml: pres['100 ml Azul'].essenceMl, container: pres['100 ml Azul'].container?.stock },
    refill: pres['Relleno 120 ml'] && { price: pres['Relleno 120 ml'].price, container: pres['Relleno 120 ml'].container },
  };

  const pay = async (items: unknown[], label: string, extra: Record<string, unknown> = {}) => {
    await sleep(2200); // límite de 5 cobros por 10 s
    return read(await checkout.POST(json('/api/sales/checkout', 'POST', { items, paymentMethod: 'CASH', amountPaid: 1000, ...extra }, { 'idempotency-key': `perfumeria-${label}-${Date.now()}` })));
  };
  const line = (code: string, presentation: string, quantity: number, extra: Record<string, unknown> = {}) => ({
    storeProductId: byCode[code].storeProductId, perfumePresentationId: pres[presentation].id, quantity, unitPrice: 1, ...extra,
  });
  const stockOf = async (storeProductId: string) => Number((await prisma.storeProduct.findUnique({ where: { id: storeProductId } }))?.stock);
  const azulContainer = pres['100 ml Azul'].container.storeProductId;

  // P3 Venta: 2 × F754 100 ml Azul + 1 relleno M1141. El cliente manda precio 1: manda el servidor.
  const sale1 = await pay([line('F754', '100 ml Azul', 2), line('M1141', 'Relleno 120 ml', 1, { refillOverride: true })], 'p3');
  const saleId = sale1.body?.saleId;
  const sale = saleId ? await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } }) : null;
  steps.P3 = {
    status: sale1.status, error: sale1.body?.message,
    total: sale ? Number(sale.total) : null,
    items: sale?.items.map((i: any) => ({ name: i.productName, ml: Number(i.quantity), bottles: Number(i.quantityOriginal), price: Number(i.sellUnitPriceApplied), unit: i.unitSunatCodeUsed, line: Number(i.totalLine), container: i.perfumeDetail?.containerQty })),
    override: sale?.items.filter((i: any) => i.perfumeDetail?.refillOverride).length,
    stock: { F754: await stockOf(byCode.F754.storeProductId), M1141: await stockOf(byCode.M1141.storeProductId), azul: await stockOf(azulContainer) },
    moves: (await prisma.movement.findMany({ where: { storeId: ctx.storeId, type: 'SALE' }, orderBy: { quantity: 'asc' } })).map((m: any) => Number(m.quantity)),
  };

  // P4 Boleta: la línea va en frascos (NIU) al precio del frasco
  if (saleId) {
    const doc = await buildPayloadFromSale(prisma, { saleId, docType: 'BOLETA' });
    const xml: string = generateInvoiceXML(doc, 'B001-1');
    const quantities = [...xml.matchAll(/<cbc:InvoicedQuantity unitCode="([^"]+)">([^<]+)</g)].map((m) => `${m[1]}:${Number(m[2])}`);
    const prices = [...xml.matchAll(/<cac:AlternativeConditionPrice>\s*<cbc:PriceAmount[^>]*>([^<]+)</g)].map((m) => Number(m[1]));
    steps.P4 = { quantities, prices, payable: doc.totals.total };
  }

  // P5 Sin envases (quedan 0 azules) y sin esencia (F754 tiene 100 ml, relleno pide 120)
  const noContainer = await pay([line('F754', '100 ml Azul', 1)], 'p5a');
  const noEssence = await pay([line('F754', 'Relleno 120 ml', 1, { refillOverride: true })], 'p5b');
  steps.P5 = { noContainer: [noContainer.status, noContainer.body?.message], noEssence: [noEssence.status, noEssence.body?.message], salesCount: await prisma.sale.count({ where: { storeId: ctx.storeId } }) };

  // P6 Descuento 10 % en 50 ml Rojo de M1141 (35.94 → 32.35)
  const discounted = await pay([line('M1141', '50 ml Rojo', 1, { discountType: 'PERCENT', discountValue: 10 })], 'p6');
  const discountedSale = discounted.body?.saleId ? await prisma.sale.findUnique({ where: { id: discounted.body.saleId } }) : null;
  steps.P6 = { status: discounted.status, total: discountedSale ? Number(discountedSale.total) : null, M1141: await stockOf(byCode.M1141.storeProductId) };

  // P7 Anular P3 devuelve esencia y envase con movimientos
  const cancelled = saleId ? await read(await cancel.POST(json(`/api/sales/${saleId}/cancel`, 'POST'), { params: Promise.resolve({ id: saleId }) })) : null;
  steps.P7 = {
    status: cancelled?.status,
    stock: { F754: await stockOf(byCode.F754.storeProductId), M1141: await stockOf(byCode.M1141.storeProductId), azul: await stockOf(azulContainer) },
    containerMove: (await prisma.movement.findFirst({ where: { storeProductId: azulContainer, type: 'ADJUSTMENT' } }))?.quantity?.toString(),
  };

  // P8 Presentaciones: cajero no edita; dueño cambia el precio y la venta siguiente lo usa
  session.role = 'CASHIER';
  const cashierPatch = await read(await presentationRoute.PATCH(json('/x', 'PATCH', { price: 1 }), { params: Promise.resolve({ id: pres['100 ml Rojo'].id }) }));
  asOwner();
  const ownerPatch = await read(await presentationRoute.PATCH(json('/x', 'PATCH', { price: 55 }), { params: Promise.resolve({ id: pres['100 ml Rojo'].id }) }));
  const newPrice = await pay([line('F111', '100 ml Rojo', 1)], 'p8');
  const newPriceSale = newPrice.body?.saleId ? await prisma.sale.findUnique({ where: { id: newPrice.body.saleId } }) : null;
  const otherStorePres = await prisma.perfumePresentation.findFirst({ where: { storeId: ctx.storeId, name: '50 ml Gris' } });
  Object.assign(session, { role: 'OWNER', userId: ctx.otherOwnerId, storeId: ctx.otherStoreId });
  const foreignPatch = await read(await presentationRoute.PATCH(json('/x', 'PATCH', { price: 1 }), { params: Promise.resolve({ id: otherStorePres.id }) }));
  asOwner();
  steps.P8 = { cashier: cashierPatch.status, owner: [ownerPatch.status, ownerPatch.body?.presentation?.price], saleTotal: newPriceSale ? Number(newPriceSale.total) : null, foreign: foreignPatch.status };

  // P9 Exportar para otra sede y respaldo de la tienda
  const exported = await exportRoute.GET();
  const exportedBody = JSON.parse(await exported.text());
  const backup = await backupExport.GET(json(`/api/backups/export?storeId=${ctx.storeId}`, 'GET', undefined, { 'x-desktop-internal-token': INTERNAL_TOKEN }));
  let backupCounts: any = null;
  if (backup.ok) {
    const AdmZip = require('adm-zip'); // eslint-disable-line @typescript-eslint/no-require-imports
    const zip = new AdmZip(Buffer.from(await backup.arrayBuffer()));
    const data = JSON.parse(zip.readAsText('data.json'));
    const lineWithDetail = data.sales.flatMap((s: any) => s.items).find((i: any) => i.perfumeDetail);
    backupCounts = { fragrances: data.fragrances?.length, presentations: data.perfumePresentations?.length, detail: Boolean(lineWithDetail) };
  }
  steps.P9 = {
    exported: { fragrances: exportedBody.fragrances?.length, presentations: exportedBody.presentations?.length, azulContainer: exportedBody.presentations?.find((p: any) => p.name === '100 ml Azul')?.container?.name },
    backup: backup.status, backupCounts,
  };

  // ---------- Fase 2 ----------
  const extras = Object.fromEntries(((await read(await extrasRoute.GET(json('/api/perfumery/extras', 'GET')))).body?.extras ?? []).map((e: any) => [e.name, e]));
  const packs = Object.fromEntries(((await read(await packsRoute.GET(json('/api/perfumery/packs', 'GET')))).body?.packs ?? []).map((p: any) => [p.name, p]));
  const feromona = extras['Feromona Dama 10 g'];
  const atomizer = packs['Pack 4 x 100 ml + atomizador']?.gift?.storeProductId;
  const container = (name: string) => pres[name].container.storeProductId;

  // P10 Extras en la misma línea: 100 ml Gris + feromona + 5 g → 83.94; anular devuelve todo.
  const beforeF111 = await stockOf(byCode.F111.storeProductId);
  const withExtras = await pay([line('F111', '100 ml Gris', 1, { perfumeExtraIds: [feromona?.id, extras['5 g adicionales']?.id] })], 'p10');
  const extrasSale = withExtras.body?.saleId ? await prisma.sale.findUnique({ where: { id: withExtras.body.saleId }, include: { items: true } }) : null;
  const afterExtras = { F111: await stockOf(byCode.F111.storeProductId), feromona: await stockOf(feromona.product.storeProductId), gris: await stockOf(container('100 ml Gris')) };
  const extrasCancel = withExtras.body?.saleId
    ? await read(await cancel.POST(json(`/api/sales/${withExtras.body.saleId}/cancel`, 'POST'), { params: Promise.resolve({ id: withExtras.body.saleId }) }))
    : null;
  steps.P10 = {
    catalog: { extras: Object.keys(extras).length, packs: Object.keys(packs).length },
    status: withExtras.status, error: withExtras.body?.message,
    total: extrasSale ? Number(extrasSale.total) : null,
    line: extrasSale?.items[0] && { name: extrasSale.items[0].productName.replace(/^F111 .* - /, 'F111 - '), ml: Number(extrasSale.items[0].quantity), price: Number(extrasSale.items[0].sellUnitPriceApplied) },
    before: beforeF111, after: afterExtras, cancel: extrasCancel?.status,
    restored: { F111: await stockOf(byCode.F111.storeProductId), feromona: await stockOf(feromona.product.storeProductId), gris: await stockOf(container('100 ml Gris')) },
  };

  // P11 Rellenos: solo con cliente que compró un frasco que habilita (Black Stone).
  const customer = await prisma.customer.create({ data: { storeId: ctx.storeId, name: 'Clienta Relleno', dni: '12345678' } });
  session.role = 'CASHIER';
  const noCustomer = await pay([line('M1025', 'Relleno 120 ml', 1)], 'p11a');
  const noPurchase = await pay([line('M1025', 'Relleno 120 ml', 1)], 'p11b', { customerId: customer.id });
  const cashierOverride = await pay([line('M1025', 'Relleno 120 ml', 1, { refillOverride: true })], 'p11c');
  const historyBefore = (await read(await historyRoute.GET(json(`/api/perfumery/customer-history?customerId=${customer.id}`, 'GET')))).body;
  const blackStone = await pay([line('F1322', '120 ml Black Stone', 1)], 'p11d', { customerId: customer.id });
  const refill = await pay([line('M1025', 'Relleno 120 ml', 1)], 'p11e', { customerId: customer.id });
  const historyAfter = (await read(await historyRoute.GET(json(`/api/perfumery/customer-history?customerId=${customer.id}`, 'GET')))).body;
  asOwner();
  steps.P11 = {
    rejected: [noCustomer.status, noCustomer.body?.code, noPurchase.status, noPurchase.body?.code, cashierOverride.status],
    blackStone: blackStone.status, refill: [refill.status, refill.body?.message ?? null],
    saleCustomer: blackStone.body?.saleId ? (await prisma.sale.findUnique({ where: { id: blackStone.body.saleId } }))?.customerId === customer.id : false,
    history: [historyBefore?.refillEligible, historyAfter?.refillEligible, historyAfter?.purchases?.map((p: any) => `${p.fragranceCode} ${p.presentationName}`)],
  };

  // P12 2x1 en rellenos: dos fragancias distintas, se paga uno; la boleta cuadra.
  await presentationRoute.PATCH(json('/x', 'PATCH', { promoBuy: 2, promoPay: 1 }), { params: Promise.resolve({ id: pres['Relleno 120 ml'].id }) });
  const promoSale = await pay([line('F754', 'Relleno 120 ml', 1), line('M1141', 'Relleno 120 ml', 1)], 'p12', { customerId: customer.id });
  const promo = promoSale.body?.saleId ? await prisma.sale.findUnique({ where: { id: promoSale.body.saleId }, include: { items: true } }) : null;
  let promoPayable: number | null = null;
  if (promo) {
    const doc = await buildPayloadFromSale(prisma, { saleId: promo.id, docType: 'BOLETA' });
    generateInvoiceXML(doc, 'B001-2');
    promoPayable = doc.totals.total;
  }
  steps.P12 = {
    status: promoSale.status, error: promoSale.body?.message, total: promo ? Number(promo.total) : null,
    lines: promo?.items.map((i: any) => [Number(i.nthPromoDiscount), Number(i.totalLine), i.perfumeDetail?.promoName]),
    payable: promoPayable,
  };

  // P13 Pack 4 x 100 ml + atomizador: misma fragancia dos veces, colores mixtos, precio repartido.
  const pack4 = packs['Pack 4 x 100 ml + atomizador'];
  const slot = (code: string, presentation: string) => ({ storeProductId: byCode[code].storeProductId, perfumePresentationId: pres[presentation].id });
  const packItem = (slots: unknown[]) => ({ perfumePackId: pack4.id, packItems: slots, quantity: 1, unitPrice: 1 });
  const wrongCount = await pay([packItem([slot('F754', '100 ml Azul'), slot('M1141', '100 ml Rojo'), slot('F111', '100 ml Gris')])], 'p13a');
  const wrongSize = await pay([packItem([slot('F754', '100 ml Azul'), slot('M1141', '100 ml Rojo'), slot('F111', '100 ml Gris'), slot('F754', 'Relleno 120 ml')])], 'p13b');
  const stock13 = async () => ({ F111: await stockOf(byCode.F111.storeProductId), atomizer: await stockOf(atomizer), azul: await stockOf(container('100 ml Azul')) });
  const before13 = await stock13();
  const packSale = await pay([packItem([slot('F754', '100 ml Azul'), slot('F111', '100 ml Azul'), slot('M1141', '100 ml Rojo'), slot('F111', '100 ml Gris')])], 'p13c');
  const packed = packSale.body?.saleId ? await prisma.sale.findUnique({ where: { id: packSale.body.saleId }, include: { items: true } }) : null;
  steps.P13 = {
    rejected: [wrongCount.status, wrongSize.status],
    status: packSale.status, error: packSale.body?.message, total: packed ? Number(packed.total) : null,
    lines: packed?.items.map((i: any) => Number(i.totalLine)).sort(),
    before: before13,
    after: await stock13(),
  };

  // P14 Reporte de consumo (ventas anuladas no cuentan).
  const report = (await read(await reportRoute.GET(json('/api/perfumery/report', 'GET')))).body;
  session.role = 'CASHIER';
  const cashierReport = await read(await reportRoute.GET(json('/api/perfumery/report', 'GET')));
  asOwner();
  steps.P14 = {
    cashier: cashierReport.status,
    totals: report?.totals && { sales: report.totals.sales, bottles: report.totals.bottles, revenue: report.totals.revenue, refills: report.totals.refills, overrides: report.totals.refillOverrides, promo: report.totals.promoBottles },
    top: report?.fragrances?.[0] && [report.fragrances[0].name, report.fragrances[0].bottles],
    packs: report?.packs?.map((p: any) => [p.name, p.quantity, p.revenue]),
    extras: report?.extras?.length,
    restock: report?.restock?.items?.length > 0,
  };

  // P15 Anular el pack devuelve esencia, envases y el regalo.
  const packCancel = packSale.body?.saleId
    ? await read(await cancel.POST(json(`/api/sales/${packSale.body.saleId}/cancel`, 'POST'), { params: Promise.resolve({ id: packSale.body.saleId }) }))
    : null;
  steps.P15 = {
    status: packCancel?.status,
    after: await stock13(),
  };

  // P16 Catálogo web: marcar fragancias, precio "desde", filtros y saneo en la nube.
  const marked = (await read(await catalogPublishRoute.POST())).body;
  const entries = await perfumeCatalogEntries(prisma, ctx.storeId, [byCode.F754.storeProductId]);
  const entry = entries.get(byCode.F754.storeProductId);
  await new CatalogPublishService('http://catalogo.test').execute({
    storeId: ctx.storeId, storeName: 'Perfumería Sede Prueba', slug: 'perfumeria-prueba', whatsappNumber: '51999999999',
    logoUrl: null, bannerUrl: null,
    products: [
      { localProductId: byCode.F754.storeProductId, name: 'F754', description: '', price: entry?.price ?? 0, category: 'Fragancias Mujer', imageUrl: null, visible: true, updatedAt: null,
        attributes: { ...entry?.attributes, options: [...(entry?.attributes.options ?? []), { name: '<b>malo</b>', price: -5 }] } },
      { localProductId: byCode.M1141.storeProductId, name: 'M1141', description: '', price: 10, category: 'Fragancias Hombre', imageUrl: null, visible: true, updatedAt: null,
        attributes: { kind: 'otro', code: 'X' } },
    ],
  });
  const publicCatalog = await new CatalogController(null, 'http://catalogo.test').getPublicCatalogBySlug('perfumeria-prueba');
  const publicF754 = publicCatalog.products.find((p: any) => p.localProductId === byCode.F754.storeProductId);
  const publicM1141 = publicCatalog.products.find((p: any) => p.localProductId === byCode.M1141.storeProductId);
  steps.P16 = {
    marked: marked?.count,
    price: entry?.price,
    options: entry?.attributes.options.map((o: any) => `${o.name}:${o.price}${o.note ? '*' : ''}`),
    public: publicF754 && { price: publicF754.price, gender: publicF754.attributes?.gender, family: Boolean(publicF754.attributes?.family), options: publicF754.attributes?.options.length },
    sanitized: publicM1141 ? publicM1141.attributes ?? null : 'missing',
  };

  // P17 Respaldo → tienda nueva: extras, packs y el detalle de la línea apuntan a la tienda nueva.
  const zipResponse = await backupExport.GET(json(`/api/backups/export?storeId=${ctx.storeId}`, 'GET', undefined, { 'x-desktop-internal-token': INTERNAL_TOKEN }));
  const zipBody = Buffer.from(await zipResponse.arrayBuffer());
  Object.assign(session, { role: 'SUPERADMIN', storeId: null, email: 'root@perfumeria.test' });
  const restored = await restoreRoute.POST(new NextRequest('http://127.0.0.1/api/backups/restore/new-store', {
    method: 'POST',
    headers: { 'content-type': 'application/zip', 'content-length': String(zipBody.length), 'x-backup-filename': 'perfumeria.zip' },
    body: zipBody,
  }));
  const restoredBody = await restored.json().catch(() => null);
  asOwner();
  const newStoreId = restoredBody?.store?.id ?? restoredBody?.storeId ?? restoredBody?.newStoreId;
  let restoredCheck: any = null;
  if (newStoreId) {
    const [newExtras, newPacks, newProducts, newItems] = await Promise.all([
      prisma.perfumeExtra.findMany({ where: { storeId: newStoreId } }),
      prisma.perfumePack.findMany({ where: { storeId: newStoreId } }),
      prisma.storeProduct.findMany({ where: { storeId: newStoreId }, select: { id: true } }),
      prisma.saleItem.findMany({ where: { sale: { storeId: newStoreId } }, select: { perfumeDetail: true } }),
    ]);
    const productIds = new Set(newProducts.map((p: any) => p.id));
    const details = newItems.map((i: any) => i.perfumeDetail).filter(Boolean);
    const withExtras = details.find((d: any) => d.extras?.length);
    const withPack = details.find((d: any) => d.pack);
    restoredCheck = {
      extras: newExtras.length,
      packs: newPacks.length,
      promo: (await prisma.perfumePresentation.findFirst({ where: { storeId: newStoreId, name: 'Relleno 120 ml' } }))?.promoBuy,
      extraIds: withExtras ? withExtras.extras.every((e: any) => newExtras.some((x: any) => x.id === e.id)) : 'missing',
      stockUses: withExtras ? withExtras.stockUses.every((u: any) => productIds.has(u.storeProductId)) && withExtras.stockUses.length > 0 : 'missing',
      packId: withPack ? newPacks.some((x: any) => x.id === withPack.pack.id) : 'missing',
      gift: withPack ? details.filter((d: any) => d.pack?.index === 0).every((d: any) => d.stockUses.every((u: any) => productIds.has(u.storeProductId))) : 'missing',
    };
  }
  steps.P17 = { status: restored.status, error: restored.status === 200 ? null : restoredBody?.message ?? null, restored: restoredCheck };

  // P18 ZIP con fotos (escritorio): las fotos quedan en la PC (USERPROFILE temporal).
  const zipRoute = require('../src/app/api/perfumery/import/zip/route');
  const AdmZipLib = require('adm-zip'); // eslint-disable-line @typescript-eslint/no-require-imports
  const tinyJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AP//Z', 'base64');
  const buildZip = () => {
    const z = new AdmZipLib();
    z.addFile('catalogo.json', Buffer.from(JSON.stringify({ fragrances: [
      { code: 'Z900', reference: 'Prueba ZIP', gender: 'UNISEX', imageUrl: 'imagenes/Z900.jpg' },
      { code: 'F754', reference: "J'adore", referenceBrand: 'Dior', gender: 'MUJER', imageUrl: 'imagenes/F754.jpg' },
    ] })));
    z.addFile('imagenes/Z900.jpg', tinyJpg);
    z.addFile('imagenes/F754.jpg', tinyJpg);
    return z.toBuffer();
  };
  const postZip = (query: string) => {
    const body = buildZip();
    return zipRoute.POST(new NextRequest(`http://127.0.0.1/api/perfumery/import/zip?${query}`, {
      method: 'POST', headers: { 'content-type': 'application/zip', 'content-length': String(body.length) }, body,
    }));
  };
  if (!os.homedir().includes('marketpos-perfumeria-')) throw new Error('P18: la carpeta de usuario no es temporal; no se prueban fotos');
  const webZip = await read(await postZip('initialStockMl=100'));
  process.env.DESKTOP_MODE = 'true';
  const firstZip = await read(await postZip('initialStockMl=100'));
  const imageOf = async (code: string) => (await prisma.fragrance.findFirst({ where: { storeId: ctx.storeId, code } }))?.imageUrl ?? null;
  const z900 = await imageOf('Z900');
  const f754Before = await imageOf('F754');
  const updateZip = await read(await postZip('updateExisting=1'));
  const f754After = await imageOf('F754');
  delete process.env.DESKTOP_MODE;
  const localPath = (url: string | null) => {
    const id = url?.split('/').pop();
    const index = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images', 'index.json'), 'utf8'));
    return Boolean(id && index[id] && fs.existsSync(path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images', index[id].filename)));
  };
  steps.P18 = {
    web: webZip.status,
    first: firstZip.body?.result && [firstZip.body.result.fragrancesCreated, firstZip.body.result.fragrancesSkipped, firstZip.body.result.imagesSaved],
    z900: Boolean(z900?.startsWith('/api/desktop/local-image/')) && localPath(z900),
    f754KeptWebImage: Boolean(f754Before?.startsWith('https://')),
    update: updateZip.body?.result && [updateZip.body.result.fragrancesUpdated, updateZip.body.result.imagesSaved],
    f754Local: Boolean(f754After?.startsWith('/api/desktop/local-image/')) && localPath(f754After),
    tempHome: os.homedir().includes('marketpos-perfumeria-'),
  };

  console.log(`RESULT:${JSON.stringify(steps)}`);
}

type Steps = Record<string, any>;
const eq = (label: string, actual: unknown, expected: unknown) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? [] : [`${label}: esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`];

const EXPECTATIONS: Array<{ id: string; title: string; check: (s: Steps) => string[] }> = [
  { id: 'P0', title: 'Rubro Perfumería disponible con sus categorías', check: (s) => [
    ...eq('perfil', s.P0?.profile, true),
    ...eq('categorías', s.P0?.categories?.slice(0, 3), ['Fragancias Mujer', 'Fragancias Hombre', 'Fragancias Unisex']),
  ] },
  { id: 'P1', title: 'Importación: solo dueño de perfumería, valida códigos y no pisa stock', check: (s) => [
    ...eq('cajero / otra tienda / inválido', [s.P1?.cashier, s.P1?.otherStore, s.P1?.bad], [403, 403, 400]),
    ...eq('primera', s.P1?.first && [s.P1.first.fragrancesCreated, s.P1.first.presentationsCreated, s.P1.first.containersCreated], [5, 14, 13]),
    ...eq('repetida', s.P1?.again && [s.P1.again.fragrancesCreated, s.P1.again.fragrancesSkipped], [0, 5]),
    ...eq('stock intacto', s.P1?.unchangedStock, 300),
    ...eq('CSV', s.P1?.csv?.fragrancesCreated, 1),
  ] },
  { id: 'P2', title: 'Búsqueda por código, perfume, marca y género; presentaciones de referencia', check: (s) => [
    ...eq('total', s.P2?.total, 6),
    ...eq('jadore', s.P2?.jadore, ['F754']),
    ...eq('varias palabras', s.P2?.accents, ['M1141']),
    ...eq('dior', s.P2?.dior, ['F754', 'M1141']),
    ...eq('hombre', s.P2?.men, ['M1025', 'M1141', 'M9001']),
    ...eq('nombre', s.P2?.names, "F754 Inspirado en J'adore de Dior"),
    ...eq('100 ml Azul', s.P2?.azul, { price: 53.94, ml: 100, container: 2 }),
    ...eq('relleno sin envase', s.P2?.refill, { price: 43, container: null }),
  ] },
  { id: 'P3', title: 'Venta fragancia + presentación: precio del servidor, ml y envase', check: (s) => [
    ...eq('respuesta', [s.P3?.status, s.P3?.error ?? null], [201, null]),
    ...eq('total', s.P3?.total, 150.88),
    ...eq('líneas', s.P3?.items?.map((i: any) => `${i.ml}ml/${i.bottles}x${i.price}/${i.unit}/${i.line}/env${i.container}`).sort(),
      ['120ml/1x43/NIU/43/env0', '200ml/2x53.94/NIU/107.88/env2']),
    ...eq('stock', s.P3?.stock, { F754: 100, M1141: 180, azul: 0 }),
    ...eq('movimientos', s.P3?.moves, [-200, -120, -2]),
    ...eq('relleno autorizado por el dueño', s.P3?.override, 1),
  ] },
  { id: 'P4', title: 'Boleta: frascos en NIU al precio del frasco', check: (s) => [
    ...eq('cantidades', s.P4?.quantities?.sort(), ['NIU:1', 'NIU:2']),
    ...eq('precios', s.P4?.prices?.sort((a: number, b: number) => a - b), [43, 53.94]),
    ...eq('total', s.P4?.payable, 150.88),
  ] },
  { id: 'P5', title: 'Rechaza sin envase o sin esencia, sin crear venta', check: (s) => [
    ...eq('sin envase', s.P5?.noContainer?.[0], 409),
    ...eq('sin esencia', s.P5?.noEssence?.[0], 409),
    ...eq('mensaje de ml', /quedan 100 ml/.test(s.P5?.noEssence?.[1] ?? ''), true),
    ...eq('ventas', s.P5?.salesCount, 1),
  ] },
  { id: 'P6', title: 'Descuento manual en la línea de perfume', check: (s) => [
    ...eq('respuesta', s.P6?.status, 201),
    ...eq('total', s.P6?.total, 32.35),
    ...eq('esencia', s.P6?.M1141, 130),
  ] },
  { id: 'P7', title: 'Anular devuelve esencia y envase', check: (s) => [
    ...eq('respuesta', s.P7?.status, 200),
    ...eq('stock', s.P7?.stock, { F754: 300, M1141: 250, azul: 2 }),
    ...eq('movimiento del envase', s.P7?.containerMove, '2'),
  ] },
  { id: 'P8', title: 'Presentaciones: solo el dueño de la sede edita y el precio nuevo se cobra', check: (s) => [
    ...eq('cajero', s.P8?.cashier, 403),
    ...eq('dueño', s.P8?.owner, [200, 55]),
    ...eq('venta', s.P8?.saleTotal, 55),
    ...eq('otra tienda', s.P8?.foreign, 403),
  ] },
  { id: 'P9', title: 'Exporta el catálogo para otra sede y el respaldo lo incluye', check: (s) => [
    ...eq('exportación', s.P9?.exported, { fragrances: 6, presentations: 14, azulContainer: 'Envase 100 ml Perfumarte Azul' }),
    ...eq('respaldo', [s.P9?.backup, s.P9?.backupCounts], [200, { fragrances: 6, presentations: 14, detail: true }]),
  ] },
  { id: 'P10', title: 'Extras en la misma línea (feromona + 5 g) y la anulación los devuelve', check: (s) => [
    ...eq('extras y packs de referencia', s.P10?.catalog, { extras: 4, packs: 6 }),
    ...eq('respuesta', [s.P10?.status, s.P10?.error ?? null], [201, null]),
    ...eq('total', s.P10?.total, 83.94),
    ...eq('línea', s.P10?.line, { name: 'F111 - 100 ml Gris + Feromona Dama 10 g + 5 g adicionales', ml: 105, price: 83.94 }),
    ...eq('stock tras la venta', s.P10?.after, { F111: s.P10?.before - 105, feromona: 1, gris: 1 }),
    ...eq('anulación', [s.P10?.cancel, s.P10?.restored], [200, { F111: s.P10?.before, feromona: 2, gris: 2 }]),
  ] },
  { id: 'P11', title: 'Relleno solo con cliente que compró un frasco que lo habilita', check: (s) => [
    ...eq('rechazos (sin cliente, sin compra, cajero autoriza)', s.P11?.rejected, [409, 'REFILL_CUSTOMER_REQUIRED', 409, 'REFILL_NOT_ALLOWED', 409]),
    ...eq('Black Stone', s.P11?.blackStone, 201),
    ...eq('cliente en la venta', s.P11?.saleCustomer, true),
    ...eq('relleno', s.P11?.refill, [201, null]),
    ...eq('historial', s.P11?.history, [false, true, ['M1025 Relleno 120 ml', 'F1322 120 ml Black Stone']]),
  ] },
  { id: 'P12', title: '2x1 en rellenos: se reparte entre líneas y la boleta cuadra', check: (s) => [
    ...eq('respuesta', [s.P12?.status, s.P12?.error ?? null], [201, null]),
    ...eq('total', s.P12?.total, 43),
    ...eq('líneas', s.P12?.lines, [[21.5, 21.5, '2x1'], [21.5, 21.5, '2x1']]),
    ...eq('boleta', s.P12?.payable, 43),
  ] },
  { id: 'P13', title: 'Pack con regalo: precio cerrado repartido, valida tamaño y cantidad', check: (s) => [
    ...eq('rechazos (cantidad, relleno en pack)', s.P13?.rejected, [400, 400]),
    ...eq('respuesta', [s.P13?.status, s.P13?.error ?? null], [201, null]),
    ...eq('total', s.P13?.total, 179.9),
    ...eq('líneas', s.P13?.lines, [44.97, 44.97, 44.97, 44.99]),
    ...eq('stock', s.P13?.after, s.P13?.before && { F111: s.P13.before.F111 - 200, atomizer: s.P13.before.atomizer - 1, azul: s.P13.before.azul - 2 }),
  ] },
  { id: 'P14', title: 'Reporte de consumo: solo el dueño y sin ventas anuladas', check: (s) => [
    ...eq('cajero', s.P14?.cashier, 403),
    ...eq('totales', s.P14?.totals, { sales: 6, bottles: 10, revenue: 413.15, refills: 3, overrides: 0, promo: 2 }),
    ...eq('packs', s.P14?.packs, [['Pack 4 x 100 ml + atomizador', 1, 179.9]]),
    ...eq('sin extras (venta anulada)', s.P14?.extras, 0),
    ...eq('reposición', s.P14?.restock, true),
  ] },
  { id: 'P15', title: 'Anular el pack devuelve esencia, envases y regalo', check: (s) => [
    ...eq('respuesta', s.P15?.status, 200),
    ...eq('stock', s.P15?.after, s.P13?.before),
  ] },
  { id: 'P16', title: 'Catálogo web: precio desde, presentaciones agrupadas y atributos saneados', check: (s) => [
    ...eq('fragancias marcadas', s.P16?.marked, 6),
    ...eq('desde', s.P16?.price, 24.9),
    ...eq('opciones', s.P16?.options, ['50 ml:35.94', '60 ml Teens:24.9', '100 ml:53.94', '100 ml Rojo:55', '120 ml Black Stone:59.9', 'Relleno 120 ml:43*']),
    ...eq('público', s.P16?.public, { price: 24.9, gender: 'MUJER', family: true, options: 6 }),
    ...eq('atributo inválido descartado', s.P16?.sanitized, null),
  ] },
  { id: 'P17', title: 'Respaldo a tienda nueva: extras, packs y detalle de líneas remapeados', check: (s) => [
    ...eq('respuesta', [s.P17?.status, s.P17?.error], [200, null]),
    ...eq('restaurado', s.P17?.restored, { extras: 4, packs: 6, promo: 2, extraIds: true, stockUses: true, packId: true, gift: true }),
  ] },
  { id: 'P18', title: 'ZIP con fotos: solo escritorio, fotos en la PC y actualizar existentes', check: (s) => [
    ...eq('carpeta temporal', s.P18?.tempHome, true),
    ...eq('web rechaza', s.P18?.web, 400),
    ...eq('primera (nueva, existente, fotos)', s.P18?.first, [1, 1, 1]),
    ...eq('foto local nueva', s.P18?.z900, true),
    ...eq('existente sin actualizar conserva su foto', s.P18?.f754KeptWebImage, true),
    ...eq('actualizar (fragancias, fotos)', s.P18?.update, [2, 2]),
    ...eq('existente con foto local', s.P18?.f754Local, true),
  ] },
];

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-perfumeria-'));
  const dataDir = path.join(tempRoot, 'data');
  const port = await freePort();
  const url = `postgresql://postgres@127.0.0.1:${port}/perfumeria?schema=public`;
  let started = false;
  let db: PrismaClient | null = null;
  try {
    console.log('Perfumería: iniciando PostgreSQL desechable...');
    run(executable('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(executable('pg_ctl'), ['start', '-D', dataDir, '-l', path.join(tempRoot, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 });
    started = true;
    run(executable('createdb'), ['perfumeria'], { env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' } });
    run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });

    db = new PrismaClient({ datasources: { db: { url } } });
    const context = await seed(db);
    const contextPath = path.join(tempRoot, 'context.json');
    fs.writeFileSync(contextPath, JSON.stringify(context));

    console.log('Perfumería: ejecutando el flujo con los handlers reales...\n');
    const worker = spawnSync(process.execPath, [tsxCli, __filename, '--mode=flow', `--context=${contextPath}`], {
      cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true,
      // USERPROFILE/HOME temporales: las fotos del ZIP no tocan Documentos del usuario.
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, NODE_ENV: 'test', SUPERADMIN_EMAILS: '', DESKTOP_INTERNAL_TOKEN: INTERNAL_TOKEN, USERPROFILE: tempRoot, HOME: tempRoot },
    });
    const resultLine = String(worker.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT:'));
    if (worker.status !== 0 || !resultLine) throw new Error(`Worker falló (${worker.status})\n${worker.stdout}${worker.stderr}`);
    const steps = JSON.parse(resultLine.slice('RESULT:'.length)) as Steps;

    const failed: string[] = [];
    for (const expectation of EXPECTATIONS) {
      const problems = expectation.check(steps);
      console.log(`${problems.length ? 'FAIL' : 'PASS'} ${expectation.id} ${expectation.title}`);
      problems.forEach((p) => console.log(`       · ${p}`));
      if (problems.length) failed.push(expectation.id);
    }
    console.log(`\nPerfumería: ${EXPECTATIONS.length - failed.length}/${EXPECTATIONS.length} pasos correctos; fallos: ${failed.join(', ') || 'ninguno'}.`);
    if (process.argv.includes('--strict') && failed.length > 0) process.exitCode = 1;
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
