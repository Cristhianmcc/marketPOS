const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertPublicDesktopEnvironment,
  findEnvironmentFiles,
  validateCloudUrl,
  writePublicDesktopEnvironment,
} = require('../desktop/scripts/public-desktop-env');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'monterrial-public-env-'));

try {
  const serverDir = path.join(sandbox, 'server', 'nested');
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(path.join(sandbox, '.env'), 'PRIVATE_KEY=must-not-survive\n');
  fs.writeFileSync(path.join(serverDir, '.env'), 'DATABASE_URL=must-not-survive\n');
  fs.writeFileSync(path.join(serverDir, '.env.production'), 'SESSION_SECRET=must-not-survive\n');
  fs.writeFileSync(path.join(serverDir, 'runtime.txt'), 'preserved');

  writePublicDesktopEnvironment({
    buildResourcesDir: sandbox,
    cloudUrl: 'https://cloud.example.test/api/',
  });

  const environmentFiles = findEnvironmentFiles(sandbox);
  assert.deepStrictEqual(environmentFiles.map(file => path.relative(sandbox, file)), ['.env']);
  assert.strictEqual(
    fs.readFileSync(path.join(sandbox, '.env'), 'utf8'),
    'CLOUD_URL=https://cloud.example.test/api\n'
  );
  assert.strictEqual(fs.readFileSync(path.join(serverDir, 'runtime.txt'), 'utf8'), 'preserved');
  assertPublicDesktopEnvironment(sandbox);

  for (const unsafeUrl of [
    'http://cloud.example.test',
    'https://user:password@cloud.example.test',
    'https://cloud.example.test/#fragment',
    'not-a-url',
  ]) {
    assert.throws(() => validateCloudUrl(unsafeUrl));
  }

  console.log('PASS H02: desktop resources retain only the allowlisted public CLOUD_URL.');
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
