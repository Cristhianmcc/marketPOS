/* eslint-disable no-console */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateUpdateFeedUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('MONTERIAL_UPDATE_FEED_URL must be a valid HTTPS URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('MONTERIAL_UPDATE_FEED_URL must use HTTPS');
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error('MONTERIAL_UPDATE_FEED_URL cannot contain credentials or a fragment');
  }

  return parsed.toString().replace(/\/$/, '');
}

function gitValue(rootDir, args, fallback) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function createReleaseMetadata({ rootDir, desktopDir, now = new Date() }) {
  const rootPackage = readJson(path.join(rootDir, 'package.json'));
  const desktopPackage = readJson(path.join(desktopDir, 'package.json'));

  if (rootPackage.version !== desktopPackage.version) {
    throw new Error(
      `Release version mismatch: root=${rootPackage.version}, desktop=${desktopPackage.version}`
    );
  }
  if (!SEMVER_PATTERN.test(desktopPackage.version)) {
    throw new Error(`Invalid release version: ${desktopPackage.version}`);
  }

  const sourceCommit = gitValue(rootDir, ['rev-parse', 'HEAD'], 'unknown');
  const sourceDirty = gitValue(
    rootDir,
    ['status', '--porcelain=v1', '--untracked-files=no'],
    ''
  ).length > 0;
  const builtAt = now.toISOString();
  const shortCommit = sourceCommit === 'unknown' ? 'unknown' : sourceCommit.slice(0, 12);
  const compactTime = builtAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const updateFeed = validateUpdateFeedUrl(process.env.MONTERIAL_UPDATE_FEED_URL);

  return {
    schemaVersion: 1,
    productName: desktopPackage.build?.productName || desktopPackage.name,
    appId: desktopPackage.build?.appId || null,
    version: desktopPackage.version,
    buildId: `${desktopPackage.version}+${shortCommit}.${compactTime}`,
    sourceCommit,
    sourceDirty,
    builtAt,
    updateFeed,
  };
}

function writeReleaseMetadata({ rootDir, desktopDir, buildResourcesDir }) {
  const metadata = createReleaseMetadata({ rootDir, desktopDir });
  fs.mkdirSync(buildResourcesDir, { recursive: true });
  fs.writeFileSync(
    path.join(buildResourcesDir, 'release-manifest.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(buildResourcesDir, 'build-id.txt'),
    `${metadata.buildId}\n`,
    'utf8'
  );
  return metadata;
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function artifactCandidates(outputDir) {
  if (!fs.existsSync(outputDir)) return [];

  const rootArtifacts = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(exe|msi|yml|yaml|blockmap|zip|7z|dmg|appimage|deb)$/i.test(entry.name))
    .map(entry => path.join(outputDir, entry.name));

  const unpackedDir = path.join(outputDir, 'win-unpacked');
  const unpackedExecutable = fs.existsSync(unpackedDir)
    ? fs.readdirSync(unpackedDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
      .map(entry => path.join(unpackedDir, entry.name))
    : [];

  return [...rootArtifacts, ...unpackedExecutable]
    .filter(filePath => path.basename(filePath) !== 'artifact-manifest.json')
    .sort((left, right) => left.localeCompare(right));
}

function writeArtifactManifest({ outputDir, buildResourcesDir }) {
  const releaseManifestPath = path.join(buildResourcesDir, 'release-manifest.json');
  if (!fs.existsSync(releaseManifestPath)) {
    throw new Error('release-manifest.json is missing; run prepare-build first');
  }

  const release = readJson(releaseManifestPath);
  const artifacts = artifactCandidates(outputDir).map(filePath => {
    const stats = fs.statSync(filePath);
    return {
      path: path.relative(outputDir, filePath).replace(/\\/g, '/'),
      size: stats.size,
      sha256: sha256(filePath),
    };
  });

  if (artifacts.length === 0) {
    throw new Error(`No distributable artifacts found in ${outputDir}`);
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    release,
    artifacts,
  };
  fs.writeFileSync(
    path.join(outputDir, 'artifact-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  return manifest;
}

module.exports = {
  SEMVER_PATTERN,
  artifactCandidates,
  createReleaseMetadata,
  validateUpdateFeedUrl,
  writeArtifactManifest,
  writeReleaseMetadata,
};
