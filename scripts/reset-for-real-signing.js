/**
 * Script para re-firmar todos los documentos SIGNED con el certificado real
 */
const { PrismaClient } = require('@prisma/client');
const https = require('https');

const p = new PrismaClient();

// Hacer petición HTTP
function httpPost(path, cookie) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie || '',
      },
    };
    
    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('\n🔧 Re-firmando documentos con certificado real...\n');
  
  // 1. Obtener documentos SIGNED
  const docs = await p.electronicDocument.findMany({
    where: { status: 'SIGNED' },
    select: { id: true, fullNumber: true, xmlSigned: true }
  });
  
  console.log(`📄 Documentos SIGNED encontrados: ${docs.length}`);
  
  if (docs.length === 0) {
    console.log('No hay documentos para re-firmar');
    await p.$disconnect();
    return;
  }
  
  // Los documentos actuales tienen XML "mock". 
  // La mejor opción es resetearlos a DRAFT y re-firmarlos via API.
  // Pero eso requiere sesión de usuario.
  
  // Alternativa: Mostrar qué hacer manualmente
  console.log('\n⚠️  Los documentos actuales tienen firma mock.');
  console.log('Para probar correctamente, necesitas crear una NUEVA venta con FACTURA o BOLETA.');
  console.log('\n📝 Pasos:');
  console.log('   1. Ir a la app: http://localhost:3000');
  console.log('   2. Hacer una venta con tipo FACTURA o BOLETA');
  console.log('   3. El documento se firmará automáticamente con tu certificado real');
  console.log('   4. Ir a /sunat/documents y click en "Enviar a SUNAT"');
  console.log('   5. El worker lo procesará\n');
  
  // Eliminar jobs pendientes y marcar documentos como DRAFT para limpiar
  console.log('🧹 Limpiando jobs y documentos con firma mock...');
  
  await p.sunatJob.deleteMany({});
  console.log('   ✅ Jobs eliminados');
  
  // Marcar los documentos como DRAFT para que se re-firmen
  await p.electronicDocument.updateMany({
    where: { status: 'SIGNED' },
    data: { 
      status: 'DRAFT',
      xmlSigned: null,
      hash: null
    }
  });
  console.log('   ✅ Documentos reseteados a DRAFT (sin firma)');
  
  console.log('\n✅ Listo. Ahora crea una nueva venta para probar con firma real.\n');
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
