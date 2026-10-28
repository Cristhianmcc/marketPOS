const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pgBin = path.join(root, 'desktop', 'vendor', 'postgres', 'bin');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const schema = path.join(root, 'prisma', 'schema.prisma');
const baselineSchema = path.join(root, 'prisma', 'baseline', 'schema.prisma');
const migrationsDir = path.join(root, 'prisma', 'migrations');
const baseline = path.join(migrationsDir, '20261020000000_baseline', 'migration.sql');
const migrationCount = fs.readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, 'migration.sql')))
  .length;

function executable(name) {
  return path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 240000,
    windowsHide: true,
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} ${args.join(' ')} failed (${result.status})\n` +
      `${result.stdout || ''}${result.stderr || ''}`
    );
  }
  return (result.stdout || '').trim();
}

function prisma(databaseUrl, args, expectedStatus = 0) {
  const commandArgs = args[0] === 'migrate' && args[1] === 'diff'
    ? [prismaCli, ...args]
    : [prismaCli, ...args, '--schema', schema];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout: 240000,
    windowsHide: true,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
  });
  if (result.error) throw result.error;
  if (result.status !== expectedStatus) {
    throw new Error(
      `prisma ${args.join(' ')} returned ${result.status}, expected ${expectedStatus}\n` +
      `${result.stdout || ''}${result.stderr || ''}`
    );
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function freePort() {
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

async function main() {
  for (const required of ['initdb', 'pg_ctl', 'createdb', 'psql']) {
    if (!fs.existsSync(executable(required))) throw new Error(`Missing bundled PostgreSQL binary: ${required}`);
  }
  if (!fs.existsSync(prismaCli)) throw new Error('Prisma CLI is not installed');
  if (!fs.existsSync(baseline) || fs.statSync(baseline).size < 10000) {
    throw new Error('The versioned baseline migration is missing or incomplete');
  }
  // Tablas creadas por todas las migraciones (baseline y aditivas) + _prisma_migrations
  const expectedTables = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, 'migration.sql')))
    .reduce((sum, entry) => sum + (fs.readFileSync(path.join(migrationsDir, entry.name, 'migration.sql'), 'utf8').match(/^CREATE TABLE /gm) || []).length, 0) + 1;

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-h04-'));
  const dataDir = path.join(tempRoot, 'data');
  const logPath = path.join(tempRoot, 'postgres.log');
  const port = await freePort();
  const pgEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres' };
  let started = false;

  try {
    console.log('H04: initializing disposable PostgreSQL...');
    run(executable('initdb'), ['-D', dataDir, '--auth=trust', '--username=postgres', '--encoding=UTF8']);
    run(
      executable('pg_ctl'),
      ['start', '-D', dataDir, '-l', logPath, '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '60'],
      { stdio: 'inherit', timeout: 90000 }
    );
    started = true;

    for (const db of ['h04_clean', 'h04_legacy', 'h04_drift']) {
      run(executable('createdb'), [db], { env: pgEnv });
    }

    const url = (db) => `postgresql://postgres@127.0.0.1:${port}/${db}?schema=public`;
    const psql = (db, args) => run(executable('psql'), ['-v', 'ON_ERROR_STOP=1', '-d', db, ...args], { env: pgEnv });

    console.log('H04: testing clean installation...');
    prisma(url('h04_clean'), ['migrate', 'deploy']);
    const cleanTables = Number(psql('h04_clean', ['-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]));
    const cleanMigrations = Number(psql('h04_clean', ['-Atc', 'SELECT count(*) FROM "_prisma_migrations"']));
    if (cleanTables !== expectedTables || cleanMigrations !== migrationCount) {
      throw new Error(`Clean install verification failed: ${cleanTables} tables, ${cleanMigrations}/${migrationCount} migrations`);
    }
    prisma(url('h04_clean'), ['migrate', 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--exit-code']);

    // Una base de una versión anterior coincide con la línea base, no con el
    // esquema actual: se adopta contra prisma/baseline y luego recibe las
    // migraciones posteriores, igual que hace el escritorio.
    console.log('H04: testing exact legacy adoption...');
    psql('h04_legacy', ['-f', baseline]);
    psql('h04_legacy', ['-c', [
      "INSERT INTO stores (id, name, updated_at) VALUES ('legacy-store', 'Bodega antigua', now());",
      "INSERT INTO products_master (id, internal_sku, name, unit_type, updated_at) VALUES ('legacy-pm', 'LEG-001', 'Arroz', 'UNIT', now());",
      "INSERT INTO store_products (id, store_id, product_id, price, stock, updated_at) VALUES ('legacy-sp', 'legacy-store', 'legacy-pm', 4.50, 12, now());",
    ].join(' ')]);
    prisma(url('h04_legacy'), ['migrate', 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', baselineSchema, '--exit-code']);
    prisma(url('h04_legacy'), ['migrate', 'resolve', '--applied', '20261020000000_baseline']);
    prisma(url('h04_legacy'), ['migrate', 'deploy']);
    const legacyMigrations = Number(psql('h04_legacy', ['-Atc', 'SELECT count(*) FROM "_prisma_migrations"']));
    if (legacyMigrations !== migrationCount) throw new Error(`Legacy adoption recorded ${legacyMigrations}/${migrationCount} migrations`);
    const legacyProduct = psql('h04_legacy', ['-Atc', "SELECT price || '|' || stock || '|' || igv_affectation || '|' || icbper FROM store_products WHERE id = 'legacy-sp'"]);
    if (legacyProduct !== '4.50|12.000|GRAVADO|false') throw new Error(`Legacy product changed after upgrade: ${legacyProduct}`);
    prisma(url('h04_legacy'), ['migrate', 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--exit-code']);

    console.log('H04: testing incompatible schema rejection...');
    psql('h04_drift', ['-f', baseline]);
    psql('h04_drift', ['-c', 'CREATE TABLE h04_unmanaged_drift (id integer PRIMARY KEY)']);
    prisma(url('h04_drift'), ['migrate', 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', baselineSchema, '--exit-code'], 2);
    const driftHistory = psql('h04_drift', ['-Atc', "SELECT to_regclass('public._prisma_migrations') IS NOT NULL"]);
    if (driftHistory !== 'f') throw new Error('Drifted database was incorrectly baselined');

    console.log(`H04 PASS: clean install (${cleanTables} tables, ${migrationCount} migrations), exact legacy adoption and upgrade, drift rejection.`);
  } finally {
    if (started) {
      try {
        run(executable('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '60'], {
          stdio: 'inherit',
          timeout: 90000,
        });
      } catch (error) {
        console.error(`Could not stop disposable PostgreSQL: ${error.message}`);
      }
    }
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      console.error(`Could not remove disposable directory ${tempRoot}: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
