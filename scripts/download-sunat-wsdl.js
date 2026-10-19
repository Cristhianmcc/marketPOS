/**
 * Script para descargar WSDLs de SUNAT con autenticación
 * y guardarlos localmente para evitar problemas de auth
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const RUC = String(process.env.SUNAT_RUC || '').trim();
const USUARIO = String(process.env.SUNAT_SOL_USER || '').trim();
const PASSWORD = String(process.env.SUNAT_SOL_PASS || '');

if (!/^\d{11}$/.test(RUC) || !USUARIO || !PASSWORD) {
  console.error('Define SUNAT_RUC, SUNAT_SOL_USER y SUNAT_SOL_PASS antes de ejecutar este script.');
  process.exit(1);
}

const solUser = RUC + USUARIO;
const auth = Buffer.from(`${solUser}:${PASSWORD}`).toString('base64');

const wsdlDir = path.join(__dirname, '..', 'src', 'lib', 'sunat', 'wsdl');

// Crear directorio si no existe
if (!fs.existsSync(wsdlDir)) {
  fs.mkdirSync(wsdlDir, { recursive: true });
}

async function downloadFile(urlPath, filename) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'e-beta.sunat.gob.pe',
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    };

    console.log(`📥 Descargando ${filename}...`);
    
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} para ${urlPath}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const filepath = path.join(wsdlDir, filename);
        fs.writeFileSync(filepath, data);
        console.log(`   ✅ Guardado: ${filepath}`);
        resolve(data);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('\n🔧 Descargando WSDLs de SUNAT BETA...\n');
  
  try {
    // Descargar WSDL principal de billService
    const billWsdl = await downloadFile(
      '/ol-ti-itcpfegem-beta/billService?wsdl',
      'billService.wsdl'
    );
    
    // Buscar imports en el WSDL
    const importMatches = billWsdl.match(/schemaLocation="([^"]+)"/g) || [];
    const importMatches2 = billWsdl.match(/location="([^"]+\?wsdl[^"]*)"/g) || [];
    
    console.log(`\n📋 Imports encontrados: ${importMatches.length + importMatches2.length}`);
    
    // Descargar imports (ns1.wsdl, ns2.wsdl, etc)
    for (let i = 1; i <= 5; i++) {
      try {
        await downloadFile(
          `/ol-ti-itcpfegem-beta/billService?ns${i}.wsdl`,
          `billService-ns${i}.wsdl`
        );
      } catch (e) {
        console.log(`   ⚠️ ns${i}.wsdl no existe (normal)`);
      }
    }
    
    // Descargar XSD schemas
    for (let i = 1; i <= 5; i++) {
      try {
        await downloadFile(
          `/ol-ti-itcpfegem-beta/billService?xsd=${i}`,
          `billService-xsd${i}.xsd`
        );
      } catch (e) {
        console.log(`   ⚠️ xsd${i} no existe (normal)`);
      }
    }
    
    // Descargar WSDL de billConsult
    try {
      await downloadFile(
        '/ol-ti-itcpfegem-beta/billConsultService?wsdl',
        'billConsultService.wsdl'
      );
    } catch (e) {
      console.log('   ⚠️ billConsultService no disponible');
    }
    
    console.log('\n✅ WSDLs descargados correctamente');
    console.log(`📁 Ubicación: ${wsdlDir}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
