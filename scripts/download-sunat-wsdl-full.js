/**
 * Script para descargar WSDLs completos de SUNAT
 * Incluyendo ns1.wsdl y modificar referencias para uso local
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const RUC = '10746250211';
const USUARIO = 'USSER111';
const PASSWORD = 'Qwert12345';

const solUser = RUC + USUARIO;
const auth = Buffer.from(`${solUser}:${PASSWORD}`).toString('base64');

const wsdlDir = path.join(__dirname, '..', 'src', 'lib', 'sunat', 'wsdl');

// Crear directorio si no existe
if (!fs.existsSync(wsdlDir)) {
  fs.mkdirSync(wsdlDir, { recursive: true });
}

function downloadFile(urlPath) {
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

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('\n🔧 Descargando WSDLs completos de SUNAT BETA...\n');
  
  try {
    // 1. Descargar WSDL principal
    console.log('📥 Descargando billService.wsdl...');
    let mainWsdl = await downloadFile('/ol-ti-itcpfegem-beta/billService?wsdl');
    
    // 2. Descargar ns1.wsdl (el import)
    console.log('📥 Descargando billService-ns1.wsdl...');
    let ns1Wsdl = await downloadFile('/ol-ti-itcpfegem-beta/billService?ns1.wsdl');
    
    // 3. Modificar el WSDL principal para usar archivo local
    mainWsdl = mainWsdl.replace(
      'location="billService?ns1.wsdl"',
      'location="billService-ns1.wsdl"'
    );
    
    // Guardar archivos
    fs.writeFileSync(path.join(wsdlDir, 'billService.wsdl'), mainWsdl);
    console.log('   ✅ Guardado: billService.wsdl');
    
    fs.writeFileSync(path.join(wsdlDir, 'billService-ns1.wsdl'), ns1Wsdl);
    console.log('   ✅ Guardado: billService-ns1.wsdl');
    
    // 4. Descargar billConsultService si existe
    try {
      console.log('📥 Descargando billConsultService.wsdl...');
      let consultWsdl = await downloadFile('/ol-ti-itcpfegem-beta/billConsultService?wsdl');
      
      // Descargar su ns1 también
      let consultNs1;
      try {
        consultNs1 = await downloadFile('/ol-ti-itcpfegem-beta/billConsultService?ns1.wsdl');
        consultWsdl = consultWsdl.replace(
          'location="billConsultService?ns1.wsdl"',
          'location="billConsultService-ns1.wsdl"'
        );
        fs.writeFileSync(path.join(wsdlDir, 'billConsultService-ns1.wsdl'), consultNs1);
        console.log('   ✅ Guardado: billConsultService-ns1.wsdl');
      } catch (e) {
        console.log('   ⚠️ Sin ns1 para billConsultService');
      }
      
      fs.writeFileSync(path.join(wsdlDir, 'billConsultService.wsdl'), consultWsdl);
      console.log('   ✅ Guardado: billConsultService.wsdl');
    } catch (e) {
      console.log('   ⚠️ billConsultService no disponible');
    }
    
    console.log('\n✅ WSDLs descargados y preparados para uso local');
    console.log(`📁 Ubicación: ${wsdlDir}`);
    console.log('\n📝 Ahora actualiza sunatClient.ts para usar estos archivos locales');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
