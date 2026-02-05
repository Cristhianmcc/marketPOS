const https = require('https');

const auth = Buffer.from('10746250211USSER111:Qwert12345').toString('base64');

function testUrl(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'e-beta.sunat.gob.pe',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + auth,
      },
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log(`${path} => ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('  Primeros 100 chars:', data.substring(0, 100));
        }
        resolve();
      });
    }).on('error', e => {
      console.log(`${path} => ERROR: ${e.message}`);
      resolve();
    });
  });
}

async function main() {
  console.log('Probando URLs de SUNAT BETA...\n');
  
  await testUrl('/ol-ti-itcpfegem-beta/billService?wsdl');
  await testUrl('/ol-ti-itcpfegem-beta/billService?ns1.wsdl');
  await testUrl('/ol-ti-itcpfegem-beta/billService?ns1');
  await testUrl('/ol-ti-itcpfegem-beta/billService?WSDL');
}

main();
