#!/usr/bin/env node
/**
 * Actualiza el esquema de la base de la nube al arrancar la web (`npm start`).
 *
 * El escritorio usa su propio migrador (desktop/src/updater/runMigrations.ts).
 * La nube puede tener o no historial de migraciones, así que aquí:
 * 1. Se compara la base con `prisma/schema.prisma` (`migrate diff`).
 * 2. Se aplica solo lo aditivo: crear tablas, índices, tipos, columnas, claves
 *    foráneas y valores de enum. Lo demás (DROP, RENAME, cambios de tipo o de
 *    nulos) se omite y se registra: la base puede tener cosas de más.
 * 3. Si la base lleva historial (`_prisma_migrations`), registra como aplicadas
 *    las migraciones locales que falten, para que el historial quede al día.
 *
 * Nunca termina con error: si algo falla, lo registra y la web arranca igual.
 * Uso: node scripts/cloud-migrate.cjs  (requiere DATABASE_URL)
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const schema = path.join(root, 'prisma', 'schema.prisma');
const migrationsDir = path.join(root, 'prisma', 'migrations');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const log = (message) => console.log(`[cloud-migrate] ${message}`);

/** Divide por comas de primer nivel (fuera de paréntesis y comillas). */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Separa el SQL del diff en lo aditivo (se aplica) y lo demás (se omite). */
function additiveOnly(sql) {
  const statements = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  const keep = [];
  const skipped = [];
  for (const statement of statements) {
    if (/^CREATE\s+(TABLE|UNIQUE\s+INDEX|INDEX|TYPE)\b/i.test(statement)) {
      keep.push(statement);
      continue;
    }
    if (/^ALTER\s+TYPE\s+\S+\s+ADD\s+VALUE\b/i.test(statement)) {
      keep.push(statement);
      continue;
    }
    const alter = statement.match(/^(ALTER\s+TABLE\s+\S+)\s+([\s\S]+)$/i);
    if (alter) {
      const actions = splitTopLevel(alter[2]);
      const adds = actions.filter((action) => /^ADD\s+(COLUMN|CONSTRAINT)\b/i.test(action));
      const rest = actions.filter((action) => !adds.includes(action));
      if (adds.length) keep.push(`${alter[1]} ${adds.join(',\n')}`);
      if (rest.length) skipped.push(`${alter[1]} ${rest.join(', ')}`);
      continue;
    }
    skipped.push(statement);
  }
  return { sql: keep.length ? `${keep.join(';\n')};\n` : '', skipped };
}

function prisma(args, input) {
  return spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: root, encoding: 'utf8', input, env: process.env, timeout: 180_000, windowsHide: true,
  });
}

async function main() {
  if (!process.env.DATABASE_URL) return log('sin DATABASE_URL; se omite');
  if (process.env.DESKTOP_MODE === 'true') return log('modo escritorio; lo maneja el instalador');

  const diff = prisma(['migrate', 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--script']);
  if (diff.status !== 0) return log(`no se pudo comparar el esquema: ${(diff.stderr || diff.stdout).trim().slice(0, 500)}`);
  const sql = diff.stdout.trim();
  const pending = sql && !/^--\s*This is an empty migration\.?$/m.test(sql) ? sql : '';

  if (pending) {
    const { sql: additive, skipped } = additiveOnly(pending);
    if (skipped.length) log(`omitido (no aditivo, revisar a mano): ${skipped.join(' | ').slice(0, 2000)}`);
    if (additive) {
      const applied = prisma(['db', 'execute', '--schema', schema, '--stdin'], additive);
      if (applied.status !== 0) {
        return log(`falló al aplicar cambios aditivos: ${(applied.stderr || applied.stdout).trim().slice(0, 500)}`);
      }
      const summary = additive.split('\n').filter((line) => /^(CREATE|ALTER)/.test(line)).join(' | ');
      log(`cambios aditivos aplicados: ${summary.slice(0, 2000)}`);
    } else {
      log('no hay cambios aditivos pendientes');
    }
  } else {
    log('esquema al día');
  }

  // Historial: registrar como aplicadas las migraciones que ya quedaron en la base.
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    const [{ exists }] = await db.$queryRawUnsafe("select to_regclass('public._prisma_migrations') is not null as exists");
    if (!exists) return log('la base no lleva historial de migraciones');
    const rows = await db.$queryRawUnsafe(
      'select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null'
    );
    const done = new Set(rows.map((row) => row.migration_name));
    const local = fs.readdirSync(migrationsDir).filter((name) => /^\d{14}_/.test(name)).sort();
    for (const name of local.filter((n) => !done.has(n))) {
      const resolved = prisma(['migrate', 'resolve', '--applied', name, '--schema', schema]);
      log(resolved.status === 0 ? `historial: ${name} registrada` : `historial: no se pudo registrar ${name}`);
    }
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main()
    .catch((error) => log(`error: ${error?.message || error}`))
    .finally(() => process.exit(0));
}

module.exports = { additiveOnly };
