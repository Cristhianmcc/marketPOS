#!/usr/bin/env node
/**
 * build-import-zip.js
 *
 * Genera un ZIP listo para importar en Monterrial POS.
 * Cada carpeta pasada como argumento = una categoría.
 * Dentro de cada carpeta puede haber subcarpetas (se escanean recursivamente).
 *
 * Uso (una carpeta):
 *   node scripts/build-import-zip.js <carpeta1>
 *
 * Uso (varias carpetas → un solo ZIP):
 *   node scripts/build-import-zip.js <carpeta1> <carpeta2> ... --out salida.zip
 *
 * Ejemplo:
 *   node scripts/build-import-zip.js Abarrotes Bebidas Carnes --out importacion_total.zip
 */

const fs   = require('fs');
const path = require('path');

const AdmZip = (() => {
  const candidates = [
    path.join(__dirname, '..', 'desktop', 'node_modules', 'adm-zip'),
    path.join(__dirname, '..', 'node_modules', 'adm-zip'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return require(c);
  }
  throw new Error('adm-zip no encontrado.');
})();

// ── Argumentos ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node scripts/build-import-zip.js <carpeta1> [carpeta2 ...] [--out salida.zip]');
  process.exit(1);
}

// Separar --out del resto
let outputZip = null;
const sourceDirs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outputZip = args[++i];
  } else {
    sourceDirs.push(args[i]);
  }
}

if (!outputZip) {
  if (sourceDirs.length === 1) {
    const name = path.basename(sourceDirs[0]);
    outputZip = path.join(path.dirname(sourceDirs[0]), `importacion_${name}.zip`);
  } else {
    outputZip = path.join(path.dirname(sourceDirs[0]), 'importacion_total.zip');
  }
}

// Verificar que existan
for (const d of sourceDirs) {
  if (!fs.existsSync(d)) { console.error(`No existe: ${d}`); process.exit(1); }
}

// ── Escanear archivos ─────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.gif']);

function scanFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanFiles(full));
    } else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

// ── Limpiar nombre del producto ───────────────────────────────────────────────
// Entrada: "113706444_Aceite_Vegetal_Primor_Clásico_Botella_900_mL"
// Salida:  "Aceite Vegetal Primor Clásico Botella 900 mL"
function cleanProductName(fileBaseName) {
  return fileBaseName
    .replace(/^\d+_/, '')   // quitar ID numérico al inicio (ej: 113706444_)
    .replace(/_/g, ' ')     // guiones bajos → espacios
    .trim();
}

// ── Extraer Marca y Contenido del nombre ──────────────────────────────────────
// Heurística: busca palabra de envase (Botella, Envase, Lata, etc.) como pivote.
// Las palabras ANTES del envase → las últimas 1-3 son la Marca.
// El envase + número + unidad → Contenido.
//
// Ejemplos:
//   "Aceite Vegetal Primor Clásico Botella 900 mL"  → Marca: Primor, Contenido: Botella 900 mL
//   "Aceite de Coco Mi Tierra Envase 350 g"         → Marca: Mi Tierra, Contenido: Envase 350 g
//   "Vinagre Tinto Tottus 500 ml"                   → Marca: Tottus, Contenido: 500 ml
function extractBrandContent(nombre) {
  // Palabras que marcan inicio del contenido/envase
  const PACKAGING = [
    'Botella','Envase','Bolsa','Lata','Tarro','Caja','Bote','Pack',
    'Paquete','Sachet','Tubo','Frasco','Doypack','Tetrapack','Cartón',
    'Sobre','Granel','Unidad','Bandeja'
  ];

  // Unidades de medida reconocidas
  const UNITS = /\d[\d.,]*\s*(mL|ml|L|lt|g|kg|Kg|KG|gr|oz|un|unidades?|pzas?|paq|paquetes?|cc)\b/i;

  let packagingIdx = -1;
  let packagingWord = '';
  for (const pw of PACKAGING) {
    // Búsqueda insensible con límite de palabra
    const re = new RegExp(`\\b${pw}\\b`, 'i');
    const m  = re.exec(nombre);
    if (m) { packagingIdx = m.index; packagingWord = m[0]; break; }
  }

  let marca    = '';
  let contenido = '';

  if (packagingIdx > 0) {
    // Texto antes del envase → extraer marca (últimas palabras antes del envase)
    const beforePkg = nombre.substring(0, packagingIdx).trim();
    const words     = beforePkg.split(/\s+/).filter(Boolean);
    // Ignorar palabras genéricas del tipo de producto (artículos, preposiciones, etc.)
    const SKIP = new Set(['de','del','la','el','los','las','y','con','en','para','a','al','sin','e']);
    // Tomar las últimas palabras hasta encontrar preposición o agotar 3 palabras
    const brandWords = [];
    for (let i = words.length - 1; i >= 0 && brandWords.length < 3; i--) {
      if (SKIP.has(words[i].toLowerCase()) && brandWords.length > 0) break;
      brandWords.unshift(words[i]);
    }
    marca = brandWords.join(' ');

    // Texto desde el envase hasta el final → contenido
    const afterPkg = nombre.substring(packagingIdx).trim();
    contenido = afterPkg;
  } else {
    // Sin palabra de envase — intentar extraer solo el número+unidad al final
    const m = UNITS.exec(nombre);
    if (m) {
      contenido = nombre.substring(m.index).trim();
      // Marca: última(s) palabra(s) antes del número
      const before  = nombre.substring(0, m.index).trim().split(/\s+/);
      marca = before.slice(-2).join(' ');
    }
  }

  return { marca, contenido };
}

// ── Generar CSV ───────────────────────────────────────────────────────────────
// Cabeceras compatibles con POST /api/inventory/import/zip
// Nombre;Marca;Contenido;Categoria;Codigo;Tipo;Precio;Stock;Stock Minimo;Estado;Imagen
function buildCsv(rows) {
  const BOM    = '\uFEFF';
  const HEADER = 'Nombre;Marca;Contenido;Categoria;Codigo;Tipo;Precio;Stock;Stock Minimo;Estado;Imagen';
  const lines  = [HEADER];
  for (const r of rows) {
    // Escapar campos que contengan ; o "
    const escape = v => (v.includes(';') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v;
    lines.push([
      escape(r.nombre),
      escape(r.marca || ''),
      escape(r.contenido || ''),
      escape(r.categoria),
      '',         // Codigo de barras
      'UNIT',     // Tipo
      '0',        // Precio
      '0',        // Stock
      '',         // Stock Minimo
      'Activo',   // Estado
      escape(r.imagen),
    ].join(';'));
  }
  return BOM + lines.join('\r\n');
}

// ── Principal ─────────────────────────────────────────────────────────────────
const zip  = new AdmZip();
const rows = [];
const seen = new Set();
let totalFiles = 0;
let skipped = 0;

for (const sourceDir of sourceDirs) {
  const categoria = path.basename(sourceDir);
  console.log(`\n📂 ${categoria} — escaneando...`);
  const allFiles = scanFiles(sourceDir);
  totalFiles += allFiles.length;
  console.log(`   ${allFiles.length} imágenes`);

  for (const file of allFiles) {
    const relative = path.relative(sourceDir, file);
    const parts    = relative.split(path.sep);
    if (parts.length < 2) { skipped++; continue; }

    const filename = parts[parts.length - 1];
    const baseName   = path.parse(filename).name;
    const nombre     = cleanProductName(baseName);
    const { marca, contenido } = extractBrandContent(nombre);

    // Nombre en ZIP: usar fichero original (lleva ID → único garantizado)
    let zipFilename = filename;
    if (seen.has(zipFilename)) {
      zipFilename = `${categoria}_${filename}`;
    }
    seen.add(zipFilename);

    const imagenRef = `imagenes/${zipFilename}`;
    rows.push({ nombre, marca, contenido, categoria, imagen: imagenRef });
    zip.addFile(imagenRef, fs.readFileSync(file));
  }
}

// CSV
const csvContent = buildCsv(rows);
zip.addFile('inventario.csv', Buffer.from(csvContent, 'utf-8'));

// LEEME
const leeme = `ZIP de importación - Monterrial POS
=====================================
Categorías     : ${sourceDirs.map(d => path.basename(d)).join(', ')}
Productos      : ${rows.length}
Fecha          : ${new Date().toLocaleString('es-PE')}

Cómo importar:
1. Abre Monterrial POS → Inventario → Importar ZIP
2. Selecciona este archivo
3. Revisa la vista previa y confirma
`;
zip.addFile('LEEME.txt', Buffer.from(leeme, 'utf-8'));

// Guardar
if (fs.existsSync(outputZip)) fs.unlinkSync(outputZip);
zip.writeZip(outputZip);

const sizeMB = (fs.statSync(outputZip).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ ZIP generado: ${outputZip}`);
console.log(`   Categorías : ${sourceDirs.length}`);
console.log(`   Productos  : ${rows.length}`);
console.log(`   Tamaño     : ${sizeMB} MB`);
console.log(`\nListo para importar desde Inventario → Importar ZIP`);
