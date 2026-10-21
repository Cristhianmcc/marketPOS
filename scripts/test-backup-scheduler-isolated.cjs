const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const crypto = require('crypto');
const ts = require('typescript');
const AdmZip = require('adm-zip');

function assert(value, message) {
  if (!value) throw new Error(message);
}

function compile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: file,
  }).outputText;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = module.paths;
  mod._compile(js, file);
  return mod.exports;
}

const repo = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monterrial-backup-scheduler-'));
const userData = path.join(tempRoot, 'user-data');
const documents = path.join(tempRoot, 'documents');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(documents, { recursive: true });

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath: name => name === 'documents' ? documents : userData,
        getVersion: () => 'isolated-test',
      },
      safeStorage: {
        isEncryptionAvailable: () => false,
        decryptString: () => { throw new Error('No sidecar expected'); },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const stores = [
  { id: 'store-a', name: 'Tienda Norte', ruc: '20123456789', address: 'Norte' },
  { id: 'store-b', name: 'Tienda Sur', ruc: '20987654321', address: 'Sur' },
];
const token = 'isolated-internal-token';
const requests = [];
let contextFailure = false;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    headers: { get: name => String(name).toLowerCase() === 'content-type' ? 'application/json' : null },
    json: async () => body,
    arrayBuffer: async () => { throw new Error('JSON response has no binary body'); },
  };
}

global.fetch = async (url, options = {}) => {
  const headers = options.headers || {};
  assert(headers['x-desktop-internal-token'] === token, `missing internal token for ${url}`);
  assert(headers['x-desktop-app'] === 'true', `missing desktop marker for ${url}`);
  requests.push({ url: String(url), options });

  if (String(url).endsWith('/api/desktop/backup-context')) {
    return contextFailure
      ? jsonResponse({ error: 'context unavailable' }, 503)
      : jsonResponse({ stores });
  }
  if (String(url).includes('/api/backups/export?storeId=')) {
    const storeId = decodeURIComponent(String(url).split('storeId=')[1]);
    return jsonResponse({
      store: { id: storeId },
      users: [{ id: `user-${storeId}` }],
      products: [{ id: `product-${storeId}` }],
      fiscalArchive: {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: { documents: [{ id: `document-${storeId}` }], jobs: [] },
      },
    });
  }
  return jsonResponse({ error: 'unexpected endpoint' }, 404);
};

(async () => {
  const { BackupScheduler } = compile(path.join(repo, 'desktop/src/backupScheduler.ts'));
  const scheduler = new BackupScheduler('http://127.0.0.1:54321', token);

  const result = await scheduler.runScheduledBackupNow();
  assert(result.success, `scheduled backup failed: ${result.error}`);
  const status = scheduler.getStatus();
  assert(status.state === 'success', 'scheduler did not record success');
  assert(status.lastFiles.length === stores.length, 'not every active store was backed up');

  for (const file of status.lastFiles) {
    assert(fs.existsSync(file.filePath), `backup file missing for ${file.storeName}`);
    const zip = new AdmZip(file.filePath);
    const metadata = JSON.parse(zip.readAsText('metadata.json'));
    const dataText = zip.readAsText('data.json');
    const data = JSON.parse(dataText);
    const checksum = crypto.createHash('sha256').update(dataText, 'utf8').digest('hex');
    assert(metadata.checksum === `sha256:${checksum}`, `invalid checksum for ${file.storeName}`);
    assert(data.fiscalArchive?.data?.documents?.length === 1, `fiscal archive missing for ${file.storeName}`);
  }

  scheduler.destroy();

  const restartedScheduler = new BackupScheduler('http://127.0.0.1:54321', token);
  const persistedStatus = restartedScheduler.getStatus();
  assert(persistedStatus.lastSuccessAt === status.lastSuccessAt, 'last successful run was not persisted');
  assert(persistedStatus.lastFiles.length === stores.length, 'created backup files were not persisted');

  contextFailure = true;
  const failure = await restartedScheduler.runScheduledBackupNow();
  assert(!failure.success, 'context failure was not reported');
  const failedStatus = restartedScheduler.getStatus();
  assert(failedStatus.state === 'error', 'failed run was not recorded');
  assert(failedStatus.lastError?.includes('(503)'), 'visible error does not include the API status');
  assert(fs.existsSync(path.join(userData, 'backup-status.json')), 'persistent status file was not created');

  restartedScheduler.destroy();
  console.log(JSON.stringify({
    result: 'PASS',
    activeStoresBackedUp: status.lastFiles.length,
    zipChecksumVerified: true,
    fiscalArchiveIncluded: true,
    restartPersistenceVerified: true,
    internalAuthenticationVerified: true,
    visibleFailureVerified: true,
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
