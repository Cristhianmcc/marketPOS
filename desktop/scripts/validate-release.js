/* eslint-disable no-console */

const path = require('path');
const { execFileSync } = require('child_process');
const { createReleaseMetadata } = require('./release-metadata');

const ROOT_DIR = path.join(__dirname, '..', '..');
const DESKTOP_DIR = path.join(__dirname, '..');
const PRIVATE_CERTIFICATE_PATTERN = /\.(pfx|p12|pem|key)$/i;

function validateRelease() {
  const metadata = createReleaseMetadata({ rootDir: ROOT_DIR, desktopDir: DESKTOP_DIR });
  const trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
  const trackedPrivateCertificates = trackedFiles.filter(file => PRIVATE_CERTIFICATE_PATTERN.test(file));
  if (trackedPrivateCertificates.length > 0) {
    throw new Error('Private certificate files are tracked by Git; remove them before packaging');
  }

  const rootPackage = require(path.join(ROOT_DIR, 'package.json'));
  const expectedAliases = {
    'electron:dev': 'npm run desktop:dev',
    'electron:build': 'npm run desktop:build',
    'electron:pack': 'npm run desktop:portable',
  };
  for (const [script, expected] of Object.entries(expectedAliases)) {
    if (rootPackage.scripts?.[script] !== expected) {
      throw new Error(`${script} must delegate to the supported desktop workflow`);
    }
  }

  console.log(`Release ${metadata.version}`);
  console.log(`Build ${metadata.buildId}`);
  console.log(`Source ${metadata.sourceCommit}${metadata.sourceDirty ? ' (dirty)' : ''}`);
  console.log(`Updates ${metadata.updateFeed ? 'configured via trusted HTTPS manifest' : 'disabled'}`);
  return metadata;
}

if (require.main === module) {
  try {
    validateRelease();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { validateRelease };
