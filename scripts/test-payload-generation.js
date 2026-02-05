// Script para probar la generación de payload desde un documento existente
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testPayload() {
  try {
    console.log('🧪 Probando generación de payload fiscal...\n');

    // Obtener un documento existente
    const doc = await prisma.electronicDocument.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (!doc) {
      console.log('❌ No hay documentos electrónicos. Ejecuta primero:');
      console.log('   node scripts/create-test-documents.js\n');
      return;
    }

    console.log(`📄 Documento encontrado: ${doc.fullNumber}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   Tipo: ${doc.docType}`);
    console.log(`   Cliente: ${doc.customerName}`);
    console.log(`   Total: S/ ${doc.total.toFixed(2)}\n`);

    // Simular construcción de payload (igual que el endpoint)
    const { buildPayloadFromDocument } = require('../src/lib/sunat/buildPayloadFromDocument.ts');
    
    try {
      const payload = await buildPayloadFromDocument(prisma, doc.id);
      
      console.log('✅ Payload generado exitosamente:\n');
      console.log(JSON.stringify(payload, null, 2));
      console.log('\n═══════════════════════════════════════════════');
      console.log('📋 Para obtener este payload desde la API:');
      console.log(`   GET http://localhost:3000/api/sunat/documents/${doc.id}/payload`);
      console.log('   (requiere autenticación como OWNER o SUPERADMIN)\n');
      
    } catch (error) {
      console.error('❌ Error al generar payload:', error.message);
      if (error.code) {
        console.error(`   Código: ${error.code}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testPayload();
