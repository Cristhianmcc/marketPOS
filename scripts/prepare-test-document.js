// Script para preparar un documento de prueba listo para SUNAT
// Crea documento DRAFT → Build XML → Sign XML → SIGNED

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

console.log('═══════════════════════════════════════════════════');
console.log('🔧 PREPARAR DOCUMENTO DE PRUEBA PARA SUNAT');
console.log('═══════════════════════════════════════════════════\n');

async function prepareTestDocument() {
  try {
    // 1. Buscar documento DRAFT
    console.log('Paso 1: Buscar documento DRAFT\n');
    
    const draftDoc = await prisma.electronicDocument.findFirst({
      where: {
        status: 'DRAFT',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    if (!draftDoc) {
      console.log('   ❌ No hay documentos DRAFT disponibles\n');
      console.log('   💡 Crea uno primero con:');
      console.log('      node scripts/create-test-documents.js\n');
      return;
    }
    
    console.log(`   ✅ Documento DRAFT encontrado:`);
    console.log(`      ID: ${draftDoc.id}`);
    console.log(`      Número: ${draftDoc.fullNumber}`);
    console.log(`      Tipo: ${draftDoc.docType}\n`);
    
    // 2. Simular XML firmado (en desarrollo, sin certificado real)
    console.log('Paso 2: Simular firma digital\n');
    
    const mockSignedXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${draftDoc.fullNumber}</cbc:ID>
  <cbc:IssueDate>${new Date().toISOString().split('T')[0]}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listID="0101">${draftDoc.docType === 'FACTURA' ? '01' : '03'}</cbc:InvoiceTypeCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>BODEGA EL MERCADO SAC</cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <ds:Signature>
    <ds:SignedInfo>
      <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    </ds:SignedInfo>
    <ds:SignatureValue>MOCK_SIGNATURE_FOR_TESTING_${Date.now()}</ds:SignatureValue>
  </ds:Signature>
</Invoice>`;
    
    // 3. Actualizar documento a SIGNED
    const updated = await prisma.electronicDocument.update({
      where: { id: draftDoc.id },
      data: {
        status: 'SIGNED',
        xmlSigned: mockSignedXml,
        hash: 'mock_hash_' + Date.now(),
      },
    });
    
    console.log(`   ✅ Documento actualizado a SIGNED`);
    console.log(`      XML firmado: ${updated.xmlSigned ? 'Sí' : 'No'}`);
    console.log(`      Hash: ${updated.hash}\n`);
    
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ DOCUMENTO PREPARADO EXITOSAMENTE');
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('📋 Información del documento:\n');
    console.log(`   ID: ${updated.id}`);
    console.log(`   Número: ${updated.fullNumber}`);
    console.log(`   Estado: ${updated.status}`);
    console.log('');
    
    console.log('🚀 Próximos pasos:\n');
    console.log('   1. Verificar configuración SUNAT (solUser/solPass)');
    console.log('   2. Iniciar worker: npm run sunat:worker');
    console.log('   3. Encolar documento:');
    console.log(`      curl -X POST http://localhost:3000/api/sunat/documents/${updated.id}/queue`);
    console.log('      (requiere autenticación con cookie de sesión)\n');
    
    console.log('   O ejecutar script de prueba:');
    console.log(`      node scripts/test-queue-document.js ${updated.id}\n`);
    
    console.log('⚠️  NOTA: Este es un XML de prueba (mock)');
    console.log('   Para firmar con certificado real, usa:');
    console.log(`   POST /api/sunat/documents/${updated.id}/sign\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

prepareTestDocument();
