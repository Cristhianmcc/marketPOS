/**
 * Script para descargar PostgreSQL portable para Desktop build
 * Ejecutar: node scripts/download-postgres.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// PostgreSQL 15 portable para Windows x64
const POSTGRES_VERSION = '15.4-1';
const DOWNLOAD_URL = `https://get.enterprisedb.com/postgresql/postgresql-${POSTGRES_VERSION}-windows-x64-binaries.zip`;
const OUTPUT_DIR = path.join(__dirname, '..', 'vendor', 'postgres');
const TEMP_ZIP = path.join(__dirname, '..', 'postgresql-temp.zip');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Descargando desde: ${url}`);
    console.log('Esto puede tomar varios minutos...');
    
    const file = fs.createWriteStream(dest);
    let totalBytes = 0;
    let downloadedBytes = 0;
    
    const makeRequest = (targetUrl) => {
      https.get(targetUrl, (response) => {
        // Manejar redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          console.log('Siguiendo redirect...');
          makeRequest(response.headers.location);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Error HTTP: ${response.statusCode}`));
          return;
        }
        
        totalBytes = parseInt(response.headers['content-length'], 10);
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\rDescargando: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log('\n✅ Descarga completada');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    
    makeRequest(url);
  });
}

async function extractZip(zipPath, destDir) {
  console.log('Extrayendo archivos...');
  
  // Usar PowerShell para extraer en Windows
  try {
    const tempExtract = path.join(path.dirname(destDir), 'pgsql-temp');
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempExtract}' -Force"`, {
      stdio: 'inherit'
    });
    
    // Mover contenido de pgsql a postgres
    const pgsqlDir = path.join(tempExtract, 'pgsql');
    if (fs.existsSync(pgsqlDir)) {
      // Eliminar destino si existe
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      
      // Renombrar
      fs.renameSync(pgsqlDir, destDir);
      
      // Limpiar temp
      fs.rmSync(tempExtract, { recursive: true, force: true });
    }
    
    console.log('✅ Extracción completada');
    return true;
  } catch (err) {
    console.error('Error extrayendo:', err.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('Descargador de PostgreSQL Portable para Desktop');
  console.log('='.repeat(50));
  
  // Verificar si ya existe
  const pgCtl = path.join(OUTPUT_DIR, 'bin', 'pg_ctl.exe');
  if (fs.existsSync(pgCtl)) {
    console.log('✅ PostgreSQL portable ya está instalado');
    console.log(`   Ubicación: ${OUTPUT_DIR}`);
    return;
  }
  
  // Crear directorio vendor si no existe
  const vendorDir = path.dirname(OUTPUT_DIR);
  if (!fs.existsSync(vendorDir)) {
    fs.mkdirSync(vendorDir, { recursive: true });
  }
  
  try {
    // Descargar
    await downloadFile(DOWNLOAD_URL, TEMP_ZIP);
    
    // Extraer
    await extractZip(TEMP_ZIP, OUTPUT_DIR);
    
    // Limpiar zip temporal
    if (fs.existsSync(TEMP_ZIP)) {
      fs.unlinkSync(TEMP_ZIP);
    }
    
    // Verificar instalación
    if (fs.existsSync(pgCtl)) {
      console.log('\n✅ PostgreSQL portable instalado correctamente');
      console.log(`   Ubicación: ${OUTPUT_DIR}`);
      
      // Listar binarios
      const binDir = path.join(OUTPUT_DIR, 'bin');
      const binaries = ['pg_ctl.exe', 'initdb.exe', 'createdb.exe', 'pg_isready.exe', 'psql.exe'];
      console.log('\n   Binarios disponibles:');
      for (const bin of binaries) {
        const exists = fs.existsSync(path.join(binDir, bin));
        console.log(`   ${exists ? '✓' : '✗'} ${bin}`);
      }
    } else {
      console.error('❌ Error: PostgreSQL no se instaló correctamente');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
