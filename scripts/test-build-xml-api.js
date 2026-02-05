// Script para probar generación de XML desde API
const http = require('http');

const DOCUMENT_ID = 'cml628xvx0005wwbki4xwd9ph'; // F001-00000002
const PORT = 3000; // Servidor en puerto 3000

console.log('═══════════════════════════════════════════════════');
console.log('🧪 PRUEBA DE ENDPOINT build-xml');
console.log('═══════════════════════════════════════════════════\n');

// Nota: Este script hace una petición sin autenticación
// En producción, necesitarías incluir la cookie de sesión

const options = {
  hostname: 'localhost',
  port: PORT,
  path: `/api/sunat/documents/${DOCUMENT_ID}/build-xml`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

console.log(`📡 Haciendo petición a: http://localhost:${PORT}${options.path}\n`);

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📊 Status Code: ${res.statusCode}\n`);
    
    try {
      const json = JSON.parse(data);
      
      if (res.statusCode === 401) {
        console.log('❌ Error 401: No autorizado');
        console.log('   Necesitas estar autenticado para usar este endpoint\n');
        console.log('💡 Solución:');
        console.log('   1. Inicia sesión en http://localhost:3001');
        console.log('   2. Copia la cookie de sesión del navegador');
        console.log('   3. Usa curl con la cookie:\n');
        console.log(`   curl -X POST http://localhost:${PORT}/api/sunat/documents/${DOCUMENT_ID}/build-xml \\`);
        console.log('        -H "Content-Type: application/json" \\');
        console.log('        -H "Cookie: session=<TU_COOKIE>"\n');
      } else if (res.statusCode === 200) {
        console.log('✅ XML generado exitosamente!\n');
        console.log('📋 Respuesta:');
        console.log(JSON.stringify(json, null, 2));
        
        if (json.xml) {
          console.log('\n📄 Fragmento del XML generado:');
          const lines = json.xml.split('\n');
          console.log(lines.slice(0, 25).join('\n'));
          console.log('   [...resto del XML...]\n');
        }
      } else {
        console.log(`⚠️  Respuesta ${res.statusCode}:`);
        console.log(JSON.stringify(json, null, 2));
      }
    } catch (e) {
      console.log('📄 Respuesta raw:');
      console.log(data);
    }
    
    console.log('\n═══════════════════════════════════════════════════');
  });
});

req.on('error', (error) => {
  console.error('❌ Error en la petición:', error.message);
  console.log('\n💡 Asegúrate de que el servidor esté corriendo:');
  console.log('   npm run dev\n');
});

req.end();
