#!/usr/bin/env node
/**
 * Banco del migrador de la nube (scripts/cloud-migrate.cjs) con el PostgreSQL
 * incluido, en una carpeta temporal. No usa la base del usuario ni la nube.
 *
 * A: base con historial a la que le faltan las últimas migraciones.
 * B: base sin historial creada desde un esquema anterior (como la nube legada).
 * C: base al día (no cambia nada).
 * D: base sin lo nuevo y con columnas de más: crea lo nuevo, conserva lo demás.
 */
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pgBin = path.join(root, 'desktop', 'vendor', 'postgres', 'bin');
const exe = (name) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const LATEST = ['20261105000000_perfumeria', '20261105010000_perfumeria_packs_extras'];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 240_000, ...opts });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.join(' ')}\n${r.stdout}${r.stderr}`);
  return r.stdout;
}
const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-cloudmigrate-'));
  const dataDir = path.join(temp, 'data');
  const port = await freePort();
  const pgEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' };
  const urlOf = (db) => `postgresql://postgres@127.0.0.1:${port}/${db}?schema=public`;
  const envOf = (db) => ({ ...process.env, DATABASE_URL: urlOf(db), DIRECT_URL: urlOf(db), DESKTOP_MODE: '' });
  const psql = (db, sql) => run(exe('psql'), ['-At', '-d', db, '-c', sql], { env: pgEnv }).trim();
  const migrate = (db) => run(process.execPath, [path.join(root, 'scripts', 'cloud-migrate.cjs')], { env: envOf(db) });
  const tables = (db) => psql(db, "select count(*) from information_schema.tables where table_name in ('fragrances','perfume_presentations','perfume_extras','perfume_packs')");
  const history = (db) => psql(db, "select count(*) from _prisma_migrations where migration_name like '20261105%' and finished_at is not null");
  const results = [];
  const check = (label, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : `: ${detail}`}`); };
  let started = false;
  try {
    run(exe('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(exe('pg_ctl'), ['start', '-D', dataDir, '-l', path.join(temp, 'pg.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w'], { stdio: 'ignore' });
    started = true;
    for (const db of ['a', 'b', 'd']) run(exe('createdb'), [db], { env: pgEnv });

    // A: historial hasta antes de perfumería.
    const oldPrisma = path.join(temp, 'prisma-old');
    fs.cpSync(path.join(root, 'prisma'), oldPrisma, { recursive: true });
    for (const name of LATEST) fs.rmSync(path.join(oldPrisma, 'migrations', name), { recursive: true, force: true });
    run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', path.join(oldPrisma, 'schema.prisma')], { env: envOf('a') });
    const outA = migrate('a');
    check('A crea las tablas nuevas', tables('a') === '4', `${tables('a')} tablas\n${outA}`);
    check('A registra las migraciones', history('a') === '2', `${history('a')}\n${outA}`);
    check('A acepta el rubro', psql('a', "select count(*) from pg_enum where enumlabel='PERFUMERIA'") === '1', outA);

    // B: sin historial, esquema anterior (aplicando el SQL viejo sin registrar).
    const legacySql = fs.readdirSync(path.join(oldPrisma, 'migrations')).filter((n) => /^\d{14}_/.test(n)).sort()
      .map((n) => fs.readFileSync(path.join(oldPrisma, 'migrations', n, 'migration.sql'), 'utf8')).join('\n');
    run(process.execPath, [prismaCli, 'db', 'execute', '--schema', path.join(root, 'prisma', 'schema.prisma'), '--stdin'], { env: envOf('b'), input: legacySql });
    const outB = migrate('b');
    check('B crea las tablas sin historial', tables('b') === '4', `${tables('b')}\n${outB}`);
    check('B no inventa historial', psql('b', "select to_regclass('public._prisma_migrations') is null") === 't', outB);

    // C: ya al día.
    const outC = migrate('a');
    check('C esquema al día', /esquema al día/.test(outC), outC);

    // D: falta lo nuevo y sobra una columna → crea lo nuevo y no borra la columna.
    run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', path.join(oldPrisma, 'schema.prisma')], { env: envOf('d') });
    psql('d', 'alter table stores add column legacy_extra text');
    psql('d', 'alter table store_products add column legacy_note text');
    const outD = migrate('d');
    check('D crea lo nuevo aunque sobren columnas', tables('d') === '4'
      && psql('d', "select count(*) from information_schema.columns where table_name='store_products' and column_name='catalog_attributes'") === '1', `${tables('d')}\n${outD}`);
    check('D conserva las columnas de más', /omitido/.test(outD)
      && psql('d', "select count(*) from information_schema.columns where column_name in ('legacy_extra','legacy_note')") === '2', outD);
    check('D sin fallos', !/falló/.test(outD), outD);
  } finally {
    if (started) spawnSync(exe('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast', '-w'], { windowsHide: true });
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  const failed = results.filter((ok) => !ok).length;
  console.log(`\nMigrador de la nube: ${results.length - failed}/${results.length} casos correctos.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exit(1); });
