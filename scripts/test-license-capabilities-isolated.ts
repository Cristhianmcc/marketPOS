import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  createCloudAdminLicenseToken,
  createStoreLicenseToken,
  verifyCloudAdminLicenseToken,
  verifyStoreLicenseToken,
} from '../src/lib/cloudLicenseTokens';
import {
  getStoreLicenseCredential,
  saveStoreLicenseCredential,
} from '../src/lib/licenseCredentialStore';
import { registerStoreInCloud } from '../src/lib/cloudLicenseRegistration';

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  return address.port;
}

async function main() {
  process.env.SESSION_SECRET = 'isolated-license-test-secret-which-is-longer-than-32-characters';

  const adminToken = createCloudAdminLicenseToken({
    userId: 'admin-isolated',
    email: 'ADMIN@EXAMPLE.TEST',
  });
  const adminClaims = verifyCloudAdminLicenseToken(adminToken);
  assert.equal(adminClaims?.sub, 'admin-isolated');
  assert.equal(adminClaims?.email, 'admin@example.test');
  assert.equal(adminClaims?.role, 'SUPERADMIN');
  assert.equal(verifyCloudAdminLicenseToken(`${adminToken}altered`), null);

  const storeAToken = createStoreLicenseToken('store-a');
  const storeBToken = createStoreLicenseToken('store-b');
  assert.equal(verifyStoreLicenseToken(storeAToken, 'store-a'), true);
  assert.equal(verifyStoreLicenseToken(storeAToken, 'store-b'), false);
  assert.equal(verifyStoreLicenseToken(adminToken, 'store-a'), false);

  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'marketpos-license-test-'));
  process.env.MONTERRIAL_DATA_DIR = dataDir;
  try {
    await Promise.all([
      saveStoreLicenseCredential('store-a', storeAToken),
      saveStoreLicenseCredential('store-b', storeBToken),
    ]);
    assert.equal(await getStoreLicenseCredential('store-a'), storeAToken);
    assert.equal(await getStoreLicenseCredential('store-b'), storeBToken);

    const saved = JSON.parse(
      await readFile(path.join(dataDir, 'config', 'license-credentials.json'), 'utf8'),
    ) as { version: number; stores: Record<string, string> };
    assert.equal(saved.version, 1);
    assert.deepEqual(Object.keys(saved.stores).sort(), ['store-a', 'store-b']);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }

  let receivedAuthorization = '';
  let receivedStoreId = '';
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      receivedAuthorization = String(request.headers.authorization || '');
      receivedStoreId = JSON.parse(Buffer.concat(chunks).toString('utf8')).storeId;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, licenseToken: storeAToken }));
    });
  });
  const port = await listen(server);
  process.env.CLOUD_URL = `http://127.0.0.1:${port}`;
  try {
    const result = await registerStoreInCloud({
      storeId: 'store-a',
      storeName: 'Store A',
      ownerEmail: 'owner@example.test',
      ownerName: 'Owner',
      planCode: 'DEMO',
    }, adminToken);
    assert.equal(result.licenseToken, storeAToken);
    assert.equal(receivedAuthorization, `Bearer ${adminToken}`);
    assert.equal(receivedStoreId, 'store-a');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  process.env.CLOUD_URL = 'http://licenses.example.test';
  await assert.rejects(
    () => registerStoreInCloud({
      storeId: 'store-a',
      storeName: 'Store A',
      ownerEmail: 'owner@example.test',
      ownerName: 'Owner',
      planCode: 'DEMO',
    }, adminToken),
    /CLOUD_URL_MUST_USE_HTTPS/,
  );

  console.log('PASS license capabilities: scoped tokens, tamper rejection, isolated storage and bearer registration.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
