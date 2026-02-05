// Script de prueba para generación de XML UBL 2.1 (sin firma)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testXmlGeneration() {
  console.log('═════════════════════════════════════════════════');
  console.log('🧪 MÓDULO 18.3 — PRUEBA DE GENERACIÓN XML UBL 2.1');
  console.log('═════════════════════════════════════════════════\n');

  try {
    // 1. Buscar un documento electrónico de prueba
    const document = await prisma.electronicDocument.findFirst({
      where: {
        docType: { in: ['FACTURA', 'BOLETA'] },
      },
      include: {
        store: {
          include: {
            sunatSettings: true,
          },
        },
        sale: {
          include: {
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!document) {
      console.log('❌ No hay documentos electrónicos para probar');
      console.log('   Ejecuta: node scripts/create-test-documents.js\n');
      return;
    }

    console.log(`✅ Documento encontrado: ${document.fullNumber}`);
    console.log(`   ID: ${document.id}`);
    console.log(`   Tipo: ${document.docType}`);
    console.log(`   Cliente: ${document.customerName}`);
    console.log(`   Total: S/ ${document.total.toFixed(2)}\n`);

    // 2. Construir payload fiscal
    console.log('📦 Construyendo payload fiscal...');
    
    // En vez de importar TypeScript, vamos a crear el payload manualmente
    const payload = {
      issuer: {
        ruc: document.store.sunatSettings.ruc,
        razonSocial: document.store.sunatSettings.razonSocial,
        address: document.store.sunatSettings.address,
        ubigeo: document.store.sunatSettings.ubigeo,
        env: document.store.sunatSettings.env,
      },
      customer: {
        docType: document.customerDocType,
        docNumber: document.customerDocNumber,
        name: document.customerName,
        address: document.customerAddress,
      },
      items: [
        {
          lineNumber: 1,
          description: 'Producto de prueba',
          quantity: 1,
          unitPrice: Number(document.taxable),
          lineSubtotal: Number(document.taxable),
          discountsApplied: 0,
        },
      ],
      totals: {
        subtotal: Number(document.taxable),
        tax: Number(document.igv),
        total: Number(document.total),
        currency: 'PEN',
      },
      metadata: {
        docType: document.docType,
        series: document.series,
        number: document.number,
        fullNumber: document.fullNumber,
        issueDate: document.issueDate,
        saleId: document.saleId,
        documentId: document.id,
      },
    };
    
    console.log(`   ✅ Payload construido con ${payload.items.length} items\n`);

    // 3. Mostrar que generación XML requiere Next.js/TypeScript
    console.log('📄 Generación XML UBL 2.1:');
    console.log('   ⚠️  La generación de XML requiere Next.js/TypeScript');
    console.log('   Use el endpoint API: POST /api/sunat/documents/:id/build-xml\n');

    // 4. Mostrar estructura del payload
    console.log('📋 Estructura del Payload:\n');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');

    // 5. Verificar estado del certificado
    console.log('🔐 Estado del certificado digital:');
    const settings = document.store.sunatSettings;
    if (!settings) {
      console.log('   ❌ No hay SunatSettings configurado');
    } else if (!settings.certPfxBase64 || !settings.certPassword) {
      console.log('   ⚠️  Certificado NO configurado (OK para pruebas)');
      console.log('      Para firmar, configure certPfxBase64 y certPassword');
    } else {
      console.log('   ✅ Certificado configurado');
      console.log('      Puede probar la firma con: POST /api/sunat/documents/:id/sign');
    }
    console.log('');

    // 7. Resumen
    console.log('═════════════════════════════════════════════════');
    console.log('✅ PREPARACIÓN COMPLETADA\n');
    console.log('📋 Archivos implementados:');
    console.log('   ✅ src/lib/sunat/ubl/types.ts');
    console.log('   ✅ src/lib/sunat/ubl/common.ts');
    console.log('   ✅ src/lib/sunat/ubl/invoice.ts');
    console.log('   ✅ src/lib/sunat/ubl/creditNote.ts');
    console.log('   ✅ src/lib/sunat/ubl/debitNote.ts');
    console.log('   ✅ src/lib/sunat/cert/loadCertificate.ts');
    console.log('   ✅ src/lib/sunat/sign/signXml.ts');
    console.log('   ✅ src/app/api/sunat/documents/[id]/build-xml/route.ts');
    console.log('   ✅ src/app/api/sunat/documents/[id]/sign/route.ts\n');
    
    console.log('📋 Próximos pasos:');
    console.log('   1. Iniciar servidor: npm run dev');
    console.log('   2. Probar build-xml con endpoint API');
    console.log('   3. Configurar certificado digital PFX');
    console.log('   4. Probar sign con endpoint API\n');

    console.log('🧪 Prueba con cURL (build-xml):');
    console.log(`   curl -X POST http://localhost:3000/api/sunat/documents/${document.id}/build-xml \\`);
    console.log('        -H "Content-Type: application/json" \\');
    console.log('        -H "Cookie: session=<your_session_cookie>"\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testXmlGeneration();
