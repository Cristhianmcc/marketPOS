/* eslint-disable no-console */
/**
 * electron-builder sometimes fails on Windows when the previous output folder is locked
 * (Defender/indexer/leftover processes), e.g. "remove ... ffmpeg.dll: Acceso denegado."
 *
 * This wrapper retries once with a fresh output directory so builds can succeed
 * without manually deleting dist-electron.
 */

const { spawn } = require('child_process');
const path = require('path');

const argv = process.argv.slice(2);

const isWindows = process.platform === 'win32';
const builderBin = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  isWindows ? 'electron-builder.cmd' : 'electron-builder'
);

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function shouldRetry(output) {
  const s = output.toLowerCase();
  return (
    s.includes('acceso denegado') ||
    s.includes('ensureemptydir') ||
    s.includes('ffmpeg.dll') ||
    s.includes('icudtl.dat') ||
    s.includes('err_electron_builder_cannot_execute') ||
    s.includes('the process cannot access the file') ||
    s.includes('being used by another process') ||
    s.includes('eperm') ||
    s.includes('eacces')
  );
}

function runBuilder(extraArgs, label) {
  return new Promise((resolve, reject) => {
    let out = '';

    const p = spawn(builderBin, [...argv, ...extraArgs], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    p.stdout.on('data', (d) => {
      process.stdout.write(d);
      out += d.toString();
      if (out.length > 200_000) out = out.slice(-200_000);
    });
    p.stderr.on('data', (d) => {
      process.stderr.write(d);
      out += d.toString();
      if (out.length > 200_000) out = out.slice(-200_000);
    });

    p.on('error', (err) => {
      err._builderOutput = out;
      err._label = label;
      reject(err);
    });
    p.on('close', (code) => {
      if (code === 0) return resolve({ code, out });
      const err = new Error(`electron-builder failed (exit ${code}) [${label}]`);
      err._builderOutput = out;
      err._label = label;
      reject(err);
    });
  });
}

async function main() {
  try {
    await runBuilder([], 'primary');
    return;
  } catch (err) {
    const captured = (err && err._builderOutput) || '';
    if (!shouldRetry(captured)) throw err;

    const freshOutput = `dist-electron-${stamp()}`;
    console.log('');
    console.log('[build] Detected locked output folder. Retrying with:', freshOutput);
    console.log('');

    await runBuilder([`-c.directories.output=${freshOutput}`], 'retry-fresh-output');
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

