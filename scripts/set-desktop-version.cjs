const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const version = String(process.argv[2] || '').trim();
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!semverPattern.test(version)) {
  console.error('Usage: npm run desktop:version -- <semver>');
  process.exit(1);
}

const files = [
  ['package.json', false],
  ['package-lock.json', true],
  ['desktop/package.json', false],
  ['desktop/package-lock.json', true],
];

for (const [relativePath, isLock] of files) {
  const filePath = path.join(rootDir, relativePath);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.version = version;
  if (isLock && json.packages?.['']) json.packages[''].version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

console.log(`Desktop release version set to ${version}`);
