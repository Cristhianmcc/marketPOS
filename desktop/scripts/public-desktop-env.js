/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const PUBLIC_DESKTOP_ENV_KEYS = Object.freeze(['CLOUD_URL']);
const ENV_FILE_PATTERN = /^\.env(?:\..+)?$/i;

function validateCloudUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('CLOUD_URL is required to authenticate a new desktop installation');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('CLOUD_URL must be a valid HTTPS URL');
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.hash
  ) {
    throw new Error('CLOUD_URL must be HTTPS and cannot contain credentials or fragments');
  }

  return parsed.toString().replace(/\/+$/, '');
}

function findEnvironmentFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const found = [];
  const pending = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (ENV_FILE_PATTERN.test(entry.name)) {
        found.push(entryPath);
      }
    }
  }
  return found;
}

function parseEnvironmentKeys(content) {
  return String(content)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.slice(0, line.indexOf('=')).trim())
    .filter(Boolean);
}

function assertPublicDesktopEnvironment(buildResourcesDir) {
  const expectedPath = path.resolve(buildResourcesDir, '.env');
  const environmentFiles = findEnvironmentFiles(buildResourcesDir)
    .map(file => path.resolve(file));

  if (environmentFiles.length !== 1 || environmentFiles[0] !== expectedPath) {
    throw new Error('Desktop resources must contain exactly one root public .env file');
  }

  const keys = parseEnvironmentKeys(fs.readFileSync(expectedPath, 'utf8'));
  if (
    keys.length !== PUBLIC_DESKTOP_ENV_KEYS.length
    || keys.some(key => !PUBLIC_DESKTOP_ENV_KEYS.includes(key))
  ) {
    throw new Error('Desktop public .env contains a key outside the allowlist');
  }
}

function writePublicDesktopEnvironment({ buildResourcesDir, cloudUrl }) {
  fs.mkdirSync(buildResourcesDir, { recursive: true });

  // Next standalone can copy the repository .env into server/.env. Remove every
  // inherited environment file before creating the single public allowlisted one.
  for (const environmentFile of findEnvironmentFiles(buildResourcesDir)) {
    fs.rmSync(environmentFile, { force: true });
  }

  const publicEnvPath = path.join(buildResourcesDir, '.env');
  fs.writeFileSync(
    publicEnvPath,
    `CLOUD_URL=${validateCloudUrl(cloudUrl)}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  assertPublicDesktopEnvironment(buildResourcesDir);
  return publicEnvPath;
}

module.exports = {
  PUBLIC_DESKTOP_ENV_KEYS,
  assertPublicDesktopEnvironment,
  findEnvironmentFiles,
  validateCloudUrl,
  writePublicDesktopEnvironment,
};
