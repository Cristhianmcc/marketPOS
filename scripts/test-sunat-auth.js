/**
 * Script para probar conexión SUNAT BETA
 */
const https = require('https');

const RUC = String(process.env.SUNAT_RUC || '').trim();
const USUARIO = String(process.env.SUNAT_SOL_USER || '').trim();
const PASSWORD = String(process.env.SUNAT_SOL_PASS || '');

if (!/^\d{11}$/.test(RUC) || !USUARIO || !PASSWORD) {
  throw new Error('Configura SUNAT_RUC, SUNAT_SOL_USER y SUNAT_SOL_PASS');
}

const solUser = RUC + USUARIO;
const auth = Buffer.from(`${solUser}:${PASSWORD}`).toString('base64');

console.log('\n🔐 Probando credenciales SUNAT...');
console.log(`   Longitud: ${solUser.length} caracteres`);

const options = {
  hostname: 'e-beta.sunat.gob.pe',
  port: 443,
  path: '/ol-ti-itcpfegem-beta/billService?wsdl',
  method: 'GET',
  headers: {
    'Authorization': `Basic ${auth}`,
  },
};

console.log('\n📡 Conectando a SUNAT BETA...');
console.log(`   URL: https://${options.hostname}${options.path}`);

const req = https.request(options, (res) => {
  console.log(`\n✅ Respuesta HTTP: ${res.statusCode}`);
  
  if (res.statusCode === 200) {
    console.log('🎉 ¡Credenciales válidas! WSDL accesible.');
  } else if (res.statusCode === 401) {
    console.log('❌ Error 401: Credenciales inválidas');
    console.log('   Verifica usuario SOL y contraseña');
  } else {
    console.log(`⚠️  Código inesperado: ${res.statusCode}`);
  }
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('\n📄 WSDL recibido (primeros 500 chars):');
      console.log(data.substring(0, 500));
    } else {
      console.log('\n📄 Respuesta completa:');
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Error de red:', e.message);
});

req.end();
