// Debug: ver el XML firmado de un documento
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Obtener el último documento firmado o con error
  const doc = await prisma.electronicDocument.findFirst({
    orderBy: { updatedAt: 'desc' },
    where: { 
      OR: [
        { status: 'SIGNED' },
        { status: 'ERROR' },
        { status: 'SENT' }
      ]
    },
  });
  
  if (!doc) {
    console.log('No hay documentos firmados/enviados');
    return;
  }
  
  console.log('📄 Documento:', doc.fullNumber);
  console.log('   Estado:', doc.status);
  console.log('   Tipo:', doc.docType);
  console.log('   Mensaje SUNAT:', doc.sunatMessage || '(ninguno)');
  console.log('   Código SUNAT:', doc.sunatCode || '(ninguno)');
  console.log('');
  
  if (doc.xmlSigned) {
    console.log('='.repeat(80));
    console.log('XML FIRMADO (primeros 3000 chars):');
    console.log('='.repeat(80));
    console.log(doc.xmlSigned.substring(0, 3000));
    console.log('...');
  } else {
    console.log('⚠️  Sin XML firmado');
  }
  
  // Ver también el ZIP que se envió
  if (doc.zipSentBase64) {
    console.log('\n📦 ZIP enviado:', doc.zipSentBase64.length, 'caracteres base64');
    
    // Decodificar y ver contenido
    const AdmZip = require('adm-zip');
    const zipBuffer = Buffer.from(doc.zipSentBase64, 'base64');
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    
    console.log('   Archivos en el ZIP:');
    for (const entry of entries) {
      console.log('   -', entry.entryName, '(', entry.header.size, 'bytes)');
      
      // Mostrar el contenido del XML
      if (entry.entryName.endsWith('.xml')) {
        const content = entry.getData().toString('utf8');
        console.log('\n='.repeat(80));
        console.log('CONTENIDO DEL XML EN EL ZIP:');
        console.log('='.repeat(80));
        console.log(content.substring(0, 3000));
        if (content.length > 3000) console.log('...');
      }
    }
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
