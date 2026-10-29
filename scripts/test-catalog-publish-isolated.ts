/**
 * Banco de pruebas del catálogo web contra PostgreSQL real.
 *
 * El mismo proceso hace de escritorio y de nube: el `fetch` del escritorio se
 * dirige a los handlers de la nube. Comprueba que el escritorio publica con el
 * token de licencia de la tienda (sin claves en el instalador), que la nube
 * rechaza publicaciones sin token o con el token de otra tienda, que el
 * catálogo publicado se ve por su enlace y que la subida de imágenes pasa por
 * la nube. No usa la base del usuario, Supabase, Cloudinary ni red.
 *
 * Uso: npx tsx scripts/test-catalog-publish-isolated.ts
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const root = path.resolve(__dirname, '..');
const pgBin = path.join(root, 'desktop', 'vendor', 'postgres', 'bin');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const executable = (name: string) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const CLOUD = 'http://cloud.test';

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
  const niu = (await db.unit.create({ data: { code: 'NIU', sunatCode: 'NIU', name: 'Unidad', symbol: 'und', allowDecimals: false, kind: 'GOODS' } })).id;
  const store = await db.store.create({ data: { name: 'Bodega Catálogo', businessProfile: 'BODEGA' } });
  const other = await db.store.create({ data: { name: 'Otra Tienda', businessProfile: 'BODEGA' } });
  const owner = await db.user.create({ data: { storeId: store.id, email: 'dueno@catalogo.test', name: 'Dueño', password: 'x', role: 'OWNER' } });
  await db.catalogSettings.create({ data: { storeId: store.id, storeSlug: 'bodega-catalogo', whatsappNumber: '51999111222' } });
  const product = async (sku: string, name: string, price: number, imageUrl: string | null, publish: boolean) => {
    const master = await db.productMaster.create({ data: { internalSku: sku, name, category: 'Bebidas', unitType: 'UNIT', baseUnitId: niu, imageUrl } });
    return (await db.storeProduct.create({ data: { storeId: store.id, productId: master.id, price, stock: 10, publishInCatalog: publish } })).id;
  };
  await product('CT-1', 'Inca Kola 500 ml', 2.5, 'https://res.cloudinary.com/demo/image/upload/inca.jpg', true);
  await product('CT-2', 'Agua 625 ml', 1.5, null, true);
  // Foto subida en el escritorio (local) que aún no está en la nube
  await product('CT-4', 'Galletas con foto local', 2, '/api/desktop/local-image/img-1', true);
  await product('CT-3', 'Producto oculto', 9, null, false);
  return { storeId: store.id, otherStoreId: other.id, ownerId: owner.id };
}

async function flowWorker(contextPath: string) {
  const ctx = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const sessionPath = require.resolve('../src/lib/session');
  const session = { userId: ctx.ownerId, storeId: ctx.storeId, email: 'dueno@catalogo.test', name: 'Dueño', role: 'OWNER', isLoggedIn: true };
  require.cache[sessionPath] = {
    id: sessionPath, filename: sessionPath, loaded: true,
    exports: { getSession: async () => session, getCurrentUser: async () => session, getCurrentStoreUser: async () => session, getStoreSessionOrThrow: async () => session },
  } as NodeJS.Module;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NextRequest } = require('next/server');
  const { prisma } = require('../src/lib/prisma');
  const { createStoreLicenseToken } = require('../src/lib/cloudLicenseTokens');
  const { saveStoreLicenseCredential } = require('../src/lib/licenseCredentialStore');
  const cloudPublish = require('../src/app/api/catalog/publish/route');
  const cloudImage = require('../src/app/api/catalog/cloud-image/route');
  const publicCatalog = require('../src/app/api/catalog/public/[slug]/route');
  const desktopPublish = require('../src/app/api/desktop/publish-catalog/route');
  const desktopSync = require('../src/app/api/desktop/sync-catalog-images/route');
  /* eslint-enable @typescript-eslint/no-require-imports */

  // La "red" del escritorio llega a los handlers de la nube de este mismo proceso
  const calls: { path: string; auth: boolean; apiKey: boolean }[] = [];
  let stubCloudinary = false;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ path: url.pathname, auth: headers.has('authorization'), apiKey: headers.has('x-api-key') });
    const req = new NextRequest(url.toString(), { method: init?.method, headers, body: init?.body as BodyInit });
    if (url.pathname === '/api/catalog/publish') return cloudPublish.POST(req);
    if (url.pathname === '/api/catalog/cloud-image') {
      // Con nube simulada se responde como lo haría Render con Cloudinary
      if (stubCloudinary) return Response.json({ url: 'https://res.cloudinary.com/demo/image/upload/galletas.png' });
      return cloudImage.POST(req);
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const read = async (response: Response) => ({ status: response.status, body: await response.json().catch(() => null) });
  const jsonReq = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const payload = {
    storeId: ctx.storeId, storeName: 'Bodega Catálogo', slug: 'bodega-catalogo', whatsappNumber: '51999111222', logoUrl: null, bannerUrl: null,
    products: [{ localProductId: 'x', name: 'Intruso', description: '', price: 1, category: 'X', imageUrl: null, visible: true, updatedAt: null }],
  };
  const steps: Record<string, unknown> = {};

  // P1 La nube rechaza publicar sin token ni clave
  steps.P1 = (await read(await cloudPublish.POST(jsonReq(`${CLOUD}/api/catalog/publish`, payload)))).status;
  // P2 La nube rechaza el token de otra tienda
  const otherToken = createStoreLicenseToken(ctx.otherStoreId);
  steps.P2 = (await read(await cloudPublish.POST(jsonReq(`${CLOUD}/api/catalog/publish`, payload, { authorization: `Bearer ${otherToken}` })))).status;

  // P3 Sin licencia registrada en el escritorio, publicar avisa claramente
  const noLicense = await read(await desktopPublish.POST(new NextRequest('http://localhost/api/desktop/publish-catalog', { method: 'POST' })));
  steps.P3 = { status: noLicense.status, error: noLicense.body?.error };

  // P4 Con la licencia de la tienda, el escritorio publica y el catálogo se ve por su enlace
  await saveStoreLicenseCredential(ctx.storeId, createStoreLicenseToken(ctx.storeId));
  calls.length = 0;
  const published = await read(await desktopPublish.POST(new NextRequest('http://localhost/api/desktop/publish-catalog', { method: 'POST' })));
  const pub = await read(await publicCatalog.GET(new NextRequest(`${CLOUD}/api/catalog/public/bodega-catalogo`), { params: Promise.resolve({ slug: 'bodega-catalogo' }) }));
  const productsOf = (body: any) => (body?.products ?? body?.data?.products ?? body?.catalog?.products ?? []).map((p: any) => `${p.name}:${p.imageUrl ? 'foto' : 'sin foto'}`).sort();
  const local = await prisma.catalogSettings.findUnique({ where: { storeId: ctx.storeId } });
  steps.P4 = {
    status: published.status, error: published.body?.error, url: published.body?.catalogUrl ?? null,
    usedToken: calls.some((c) => c.path === '/api/catalog/publish' && c.auth),
    publicStatus: pub.status, products: productsOf(pub.body), localStatus: local?.catalogStatus,
  };

  // P5 Subida de imágenes por la nube: autorizada con el token, sin Cloudinary responde 503
  const img = { storeId: ctx.storeId, kind: 'product', fileName: 'a.png', mimeType: 'image/png', dataBase64: Buffer.from('png').toString('base64') };
  steps.P5 = {
    unauthorized: (await read(await cloudImage.POST(jsonReq(`${CLOUD}/api/catalog/cloud-image`, img)))).status,
    authorizedNoCloudinary: (await read(await cloudImage.POST(jsonReq(`${CLOUD}/api/catalog/cloud-image`, img, { authorization: `Bearer ${createStoreLicenseToken(ctx.storeId)}` })))).status,
    badType: (await read(await cloudImage.POST(jsonReq(`${CLOUD}/api/catalog/cloud-image`, { ...img, mimeType: 'text/html' }, { authorization: `Bearer ${createStoreLicenseToken(ctx.storeId)}` })))).status,
  };

  // P6 El escritorio sin Cloudinary propio puede subir imágenes (vía nube)
  const pending = await read(await desktopSync.GET(new NextRequest('http://localhost/api/desktop/sync-catalog-images')));
  steps.P6 = { status: pending.status, uploadsAvailable: pending.body?.cloudinaryConfigured };

  // P7 Sincronizar la foto local: se sube por la nube y no se reescribe el índice
  const imagesDir = path.join(os.homedir(), 'Documents', 'MonterrialPOS', 'local-images');
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(path.join(imagesDir, 'img-1.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const indexPath = path.join(imagesDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify({ 'img-1': { filename: 'img-1.png', mime: 'image/png', createdAt: '2026-10-28' } }));
  const indexBefore = fs.statSync(indexPath).mtimeMs;
  stubCloudinary = true;
  calls.length = 0;
  const synced = await read(await desktopSync.POST(new NextRequest('http://localhost/api/desktop/sync-catalog-images', { method: 'POST' })));
  stubCloudinary = false;
  const galletas = await prisma.storeProduct.findFirst({ where: { product: { internalSku: 'CT-4' } } });
  steps.P7 = {
    status: synced.status, synced: synced.body?.synced, failed: synced.body?.failed, errors: synced.body?.errors ?? null,
    catalogImage: galletas?.catalogImagePath ?? null,
    viaCloud: calls.some((c) => c.path === '/api/catalog/cloud-image' && c.auth),
    indexUntouched: fs.statSync(indexPath).mtimeMs === indexBefore,
  };

  console.log(`RESULT:${JSON.stringify(steps)}`);
}

type Steps = Record<string, any>;
const eq = (label: string, actual: unknown, expected: unknown) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? [] : [`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`];

const EXPECTATIONS: { id: string; title: string; check: (s: Steps) => string[] }[] = [
  { id: 'P1', title: 'La nube rechaza publicar sin token ni clave', check: (s) => eq('respuesta', s.P1, 401) },
  { id: 'P2', title: 'La nube rechaza el token de otra tienda', check: (s) => eq('respuesta', s.P2, 401) },
  { id: 'P3', title: 'Sin licencia, el escritorio explica qué falta', check: (s) => [
    ...eq('respuesta', s.P3?.status, 502),
    ...(/licencia/i.test(s.P3?.error ?? '') ? [] : [`mensaje: ${s.P3?.error}`]),
  ] },
  { id: 'P4', title: 'Con licencia publica y el catálogo se ve por su enlace', check: (s) => [
    ...eq('publicación', [s.P4?.status, s.P4?.error ?? null], [200, null]),
    ...eq('usa el token de la tienda', s.P4?.usedToken, true),
    ...eq('catálogo público', s.P4?.publicStatus, 200),
    ...eq('productos visibles', s.P4?.products, ['Agua 625 ml:sin foto', 'Galletas con foto local:sin foto', 'Inca Kola 500 ml:foto']),
    ...eq('estado local', s.P4?.localStatus, 'PUBLISHED'),
  ] },
  { id: 'P5', title: 'Subida de imágenes por la nube: token obligatorio y formatos válidos', check: (s) =>
    eq('respuestas', s.P5, { unauthorized: 401, authorizedNoCloudinary: 503, badType: 400 }) },
  { id: 'P7', title: 'Sincroniza la foto local por la nube sin reescribir el índice', check: (s) => [
    ...eq('respuesta', [s.P7?.status, s.P7?.synced, s.P7?.failed], [200, 1, 0]),
    ...eq('foto en el catálogo', s.P7?.catalogImage, 'https://res.cloudinary.com/demo/image/upload/galletas.png'),
    ...eq('subida por la nube con licencia', s.P7?.viaCloud, true),
    ...eq('índice intacto', s.P7?.indexUntouched, true),
  ] },
  { id: 'P6', title: 'El escritorio sin claves de Cloudinary puede subir imágenes vía nube', check: (s) =>
    eq('disponible', [s.P6?.status, s.P6?.uploadsAvailable], [200, true]) },
];

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-catalog-'));
  const dataDir = path.join(tempRoot, 'data');
  const port = await freePort();
  const url = `postgresql://postgres@127.0.0.1:${port}/catalog?schema=public`;
  let started = false;
  let db: PrismaClient | null = null;
  try {
    console.log('Catálogo: iniciando PostgreSQL desechable...');
    run(executable('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(executable('pg_ctl'), ['start', '-D', dataDir, '-l', path.join(tempRoot, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '60'], { stdio: 'ignore', timeout: 90_000 });
    started = true;
    run(executable('createdb'), ['catalog'], { env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' } });
    run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });

    db = new PrismaClient({ datasources: { db: { url } } });
    const context = await seed(db);
    const contextPath = path.join(tempRoot, 'context.json');
    fs.writeFileSync(contextPath, JSON.stringify(context));

    console.log('Catálogo: publicando con los handlers reales...\n');
    // Entorno del instalador: sin claves de Cloudinary ni clave compartida del catálogo
    const fakeHome = path.join(tempRoot, 'home');
    const env: NodeJS.ProcessEnv = { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome, DATABASE_URL: url, DIRECT_URL: url, NODE_ENV: 'test', DESKTOP_MODE: 'true', CLOUD_URL: CLOUD,
      MONTERRIAL_DATA_DIR: path.join(tempRoot, 'runtime'), SESSION_SECRET: crypto.randomBytes(32).toString('hex') };
    // Vacías (no borradas) para que ningún .env las rellene
    for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CATALOG_API_KEY']) env[key] = '';
    const worker = spawnSync(process.execPath, [tsxCli, __filename, '--mode=flow', `--context=${contextPath}`], {
      cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true, env,
    });
    const line = String(worker.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT:'));
    if (worker.status !== 0 || !line) throw new Error(`Worker falló (${worker.status})\n${worker.stdout}${worker.stderr}`);
    const steps = JSON.parse(line.slice('RESULT:'.length)) as Steps;

    const failed: string[] = [];
    for (const expectation of EXPECTATIONS) {
      const problems = expectation.check(steps);
      console.log(`${problems.length ? 'FAIL' : 'PASS'} ${expectation.id} ${expectation.title}`);
      problems.forEach((p) => console.log(`       · ${p}`));
      if (problems.length) failed.push(expectation.id);
    }
    console.log(`\nCatálogo: ${EXPECTATIONS.length - failed.length}/${EXPECTATIONS.length} pasos correctos; defectos: ${failed.join(', ') || 'ninguno'}.`);
    if (failed.length > 0) process.exitCode = 1;
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
