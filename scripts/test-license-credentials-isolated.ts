/**
 * Almacén de licencias de tienda en el escritorio: guarda primero en la carpeta
 * de la app (AppData) y, si Windows niega el permiso, en la de datos; al leer
 * junta ambas. Usa carpetas temporales; no toca los datos del usuario.
 *
 * Uso: npx tsx scripts/test-license-credentials-isolated.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpos-credentials-'));
  const secrets = path.join(root, 'appdata');
  const data = path.join(root, 'documents');
  process.env.MONTERRIAL_SECRETS_DIR = secrets;
  process.env.MONTERRIAL_DATA_DIR = data;
  const file = (dir: string) => path.join(dir, 'config', 'license-credentials.json');
  const results: string[] = [];
  try {
    // Licencia antigua guardada en Documentos
    fs.mkdirSync(path.dirname(file(data)), { recursive: true });
    fs.writeFileSync(file(data), JSON.stringify({ version: 1, stores: { old: 'token-old' } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require('../src/lib/licenseCredentialStore');

    assert.equal(await store.getStoreLicenseCredential('old'), 'token-old');
    results.push('PASS lee la licencia antigua de Documentos');

    await store.saveStoreLicenseCredential('new', 'token-new');
    const saved = JSON.parse(fs.readFileSync(file(secrets), 'utf8'));
    assert.deepEqual(saved.stores, { old: 'token-old', new: 'token-new' });
    assert.equal(await store.getStoreLicenseCredential('new'), 'token-new');
    results.push('PASS guarda en la carpeta de la app y conserva las anteriores');

    // AppData sin permiso: se guarda en la carpeta de datos
    const realWrite = fsp.writeFile;
    (fsp as any).writeFile = async (target: string, ...rest: unknown[]) => {
      if (String(target).startsWith(secrets)) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      return (realWrite as any)(target, ...rest);
    };
    await store.saveStoreLicenseCredential('fallback', 'token-fallback');
    (fsp as any).writeFile = realWrite;
    const fallback = JSON.parse(fs.readFileSync(file(data), 'utf8'));
    assert.equal(fallback.stores.fallback, 'token-fallback');
    assert.equal(await store.getStoreLicenseCredential('fallback'), 'token-fallback');
    results.push('PASS sin permiso en la app, guarda en la carpeta de datos');

    // Un error que no es de permisos no se oculta
    (fsp as any).writeFile = async () => { throw Object.assign(new Error('disco lleno'), { code: 'ENOSPC' }); };
    await assert.rejects(store.saveStoreLicenseCredential('x', 'y'), /disco lleno/);
    (fsp as any).writeFile = realWrite;
    results.push('PASS otros errores se informan');
  } finally {
    results.forEach((line) => console.log(line));
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(`\nLicencias: ${results.length}/4 comprobaciones correctas.`);
  if (results.length !== 4) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exit(1); });
