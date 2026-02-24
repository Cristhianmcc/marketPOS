/**
 * Script para descargar PostgreSQL portable para Windows
 * Ejecutar: node electron/download-postgres.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// PostgreSQL 15 portable para Windows x64
const POSTGRES_VERSION = '15.4-1';
const DOWNLOAD_URL = `https://get.enterprisedb.com/postgresql/postgresql-${POSTGRES_VERSION}-windows-x64-binaries.zip`;
const OUTPUT_DIR = path.join(__dirname, '..', 'pgsql');
const TEMP_ZIP = path.join(__dirname, '..', 'postgresql-temp.zip');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Descargando desde: ${url}`);
    console.log('Esto puede tomar varios minutos...');
    
    const file = fs.createWriteStream(dest);
    let totalBytes = 0;
    let downloadedBytes = 0;
    
    https.get(url, (response) => {
      // Manejar redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        console.log('Siguiendo redirect...');
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
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
  });
}

async function extractZip(zipPath, destDir) {
  console.log('Extrayendo archivos...');
  
  // Usar PowerShell para extraer en Windows
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${path.dirname(destDir)}' -Force"`, {
      stdio: 'inherit'
    });
    console.log('✅ Extracción completada');
    return true;
  } catch (err) {
    console.error('Error extrayendo:', err.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('Descargador de PostgreSQL Portable para MarketPOS');
  console.log('='.repeat(50));
  console.log('');
  
  // Verificar si ya existe
  if (fs.existsSync(path.join(OUTPUT_DIR, 'bin', 'pg_ctl.exe'))) {
    console.log('✅ PostgreSQL ya está descargado en:', OUTPUT_DIR);
    console.log('   Si deseas re-descargar, elimina la carpeta pgsql/');
    return;
  }
  
  try {
    // Descargar
    await downloadFile(DOWNLOAD_URL, TEMP_ZIP);
    
    // Extraer
    await extractZip(TEMP_ZIP, OUTPUT_DIR);
    
    // Limpiar
    console.log('Limpiando archivos temporales...');
    fs.unlinkSync(TEMP_ZIP);
    
    // Verificar
    if (fs.existsSync(path.join(OUTPUT_DIR, 'bin', 'pg_ctl.exe'))) {
      console.log('');
      console.log('='.repeat(50));
      console.log('✅ PostgreSQL instalado correctamente');
      console.log('   Ubicación:', OUTPUT_DIR);
      console.log('='.repeat(50));
    } else {
      console.error('❌ Error: No se encontraron los binarios de PostgreSQL');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
