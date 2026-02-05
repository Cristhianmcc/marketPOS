/**
 * Script para probar conexión SUNAT BETA
 */
const https = require('https');

const RUC = '10746250211';
const USUARIO = 'USSER111';
const PASSWORD = 'Qwert12345';

const solUser = RUC + USUARIO;
const auth = Buffer.from(`${solUser}:${PASSWORD}`).toString('base64');

console.log('\n🔐 Probando credenciales SUNAT...');
console.log(`   Usuario SOL: ${solUser}`);
console.log(`   Longitud: ${solUser.length} caracteres`);
console.log(`   Auth Header: Basic ${auth.substring(0, 20)}...`);

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
