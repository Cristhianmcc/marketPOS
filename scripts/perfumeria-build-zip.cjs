#!/usr/bin/env node
/**
 * Arma data/perfumeria/perfumarte-catalogo.zip para importar el catálogo con
 * fotos sin depender de internet:
 *   catalogo.json   fragancias con imageUrl = "imagenes/<codigo>.jpg"
 *   imagenes/       una foto JPG de 400 px por fragancia
 *
 * Descarga las fotos públicas del catálogo de referencia (data/perfumeria/
 * perfumarte-catalogo.json) y las reduce con sharp.
 * Uso: node scripts/perfumeria-build-zip.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const AdmZip = require('adm-zip');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'data', 'perfumeria', 'perfumarte-catalogo.json');
const output = path.join(root, 'data', 'perfumeria', 'perfumarte-catalogo.zip');
const FIELDS = ['code', 'reference', 'referenceBrand', 'gender', 'family', 'aromas', 'seasons', 'occasions', 'scent', 'description'];

const withWidth = (url, width) => `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
const safeName = (code) => code.replace(/[^A-Za-z0-9-]/g, '_');

async function download(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      if (i === attempts) throw error;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(source, 'utf8'));
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'perfumeria-imagenes-'));
  const fragrances = [];
  let ok = 0;
  const failed = [];
  const queue = [...catalog.fragrances];

  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const entry = Object.fromEntries(FIELDS.map((key) => [key, f[key] ?? null]));
      if (f.imageUrl) {
        const file = `${safeName(f.code)}.jpg`;
        try {
          const raw = await download(withWidth(f.imageUrl, 400));
          const jpg = await sharp(raw).resize({ width: 400, withoutEnlargement: true })
            .flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
          fs.writeFileSync(path.join(cache, file), jpg);
          entry.imageUrl = `imagenes/${file}`;
          ok++;
        } catch (error) {
          failed.push(`${f.code}: ${error.message}`);
          entry.imageUrl = f.imageUrl; // queda el enlace web
        }
      }
      fragrances.push(entry);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  fragrances.sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));

  const zip = new AdmZip();
  zip.addFile('catalogo.json', Buffer.from(JSON.stringify({
    format: 'perfumeria-catalogo',
    version: 1,
    source: 'Catálogo público de perfumarte.pe (05/11/2026)',
    fragrances,
  }, null, 1), 'utf8'));
  for (const file of fs.readdirSync(cache)) zip.addLocalFile(path.join(cache, file), 'imagenes');
  zip.writeZip(output);
  fs.rmSync(cache, { recursive: true, force: true });

  const size = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
  console.log(`ZIP: ${output} (${size} MB) · ${fragrances.length} fragancias · ${ok} fotos`);
  if (failed.length) console.log(`Sin foto descargada (${failed.length}):\n${failed.join('\n')}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
