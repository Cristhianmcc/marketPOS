/**
 * Script para preparar el build de Electron
 * Copia los binarios de Prisma al build standalone de Next.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const standalonePath = path.join(__dirname, '..', '.next', 'standalone');
const prismaClientPath = path.join(standalonePath, 'node_modules', '.prisma', 'client');
const sourcePrismaPath = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');

console.log('📦 Preparando build para Electron...');
console.log('');

// Verificar que el build standalone existe
if (!fs.existsSync(standalonePath)) {
  console.error('❌ Error: No se encontró el build standalone de Next.js');
  console.log('   Ejecuta primero: npm run build');
  process.exit(1);
}

// Generar SQL del schema para instalación limpia
console.log('📋 Generando SQL del schema...');
try {
  const sql = execSync(
    'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
    { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
  );
  
  const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.sql');
  fs.writeFileSync(schemaPath, sql);
  console.log(`✅ SQL del schema generado (${(sql.length / 1024).toFixed(1)} KB)`);
} catch (error) {
  console.warn('⚠️ No se pudo generar SQL del schema:', error.message);
}

// Crear directorio para Prisma si no existe
if (!fs.existsSync(prismaClientPath)) {
  fs.mkdirSync(prismaClientPath, { recursive: true });
  console.log('✅ Directorio .prisma/client creado');
}

// Copiar binarios de Prisma
const filesToCopy = [
  'query_engine-windows.dll.node',
  'libquery_engine-windows.dll.node',
  'schema.prisma',
  'index.js',
  'index.d.ts',
  'runtime',
  'edge.js',
  'default.js',
  'wasm.js'
];

let copiedCount = 0;

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
    copiedCount++;
  }
}

// Copiar todos los archivos del cliente Prisma
if (fs.existsSync(sourcePrismaPath)) {
  console.log('📋 Copiando cliente Prisma...');
  copyRecursive(sourcePrismaPath, prismaClientPath);
  console.log(`✅ ${copiedCount} archivos de Prisma copiados`);
} else {
  console.warn('⚠️ No se encontró el cliente Prisma en node_modules');
}

// Verificar el query engine
const queryEngine = path.join(prismaClientPath, 'query_engine-windows.dll.node');
if (fs.existsSync(queryEngine)) {
  console.log('✅ Query engine de Prisma encontrado');
} else {
  console.warn('⚠️ Query engine no encontrado - puede haber problemas con la BD');
}

// Verificar PostgreSQL embebido
const pgsqlPath = path.join(__dirname, '..', 'pgsql', 'bin', 'pg_ctl.exe');
if (fs.existsSync(pgsqlPath)) {
  console.log('✅ PostgreSQL embebido encontrado');
} else {
  console.warn('');
  console.warn('⚠️  PostgreSQL embebido NO encontrado');
  console.warn('    El instalador se creará SIN base de datos local.');
  console.warn('    Para incluir PostgreSQL embebido, ejecuta primero:');
  console.warn('    npm run electron:download-pg');
  console.warn('');
}

console.log('');
console.log('✅ Build preparado para Electron');
console.log('   Ejecuta: npx electron-builder --win --x64');
