// Script para crear un documento SUNAT de prueba directamente desde el código
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simular lo que hace el servicio SUNAT
async function createTestDocument() {
  try {
    console.log('🧪 Creando documento SUNAT de prueba...\n');

    const store = await prisma.store.findFirst();
    if (!store) {
      console.log('❌ No hay tiendas');
      return;
    }

    // 1. Obtener configuración SUNAT
    const settings = await prisma.sunatSettings.findUnique({
      where: { storeId: store.id }
    });

    if (!settings) {
      console.log('❌ No existe configuración SUNAT');
      return;
    }

    // 2. Crear documento usando transacción para atomicidad
    const document = await prisma.$transaction(async (tx) => {
      // Obtener y actualizar correlativo atómicamente
      const updated = await tx.sunatSettings.update({
        where: { storeId: store.id },
        data: {
          nextBoletaNumber: {
            increment: 1
          }
        }
      });

      const series = settings.defaultBoletaSeries;
      const number = settings.nextBoletaNumber;
      const fullNumber = `${series}-${number.toString().padStart(8, '0')}`;

      // Crear documento
      const doc = await tx.electronicDocument.create({
        data: {
          storeId: store.id,
          docType: 'BOLETA',
          series: series,
          number: number,
          fullNumber: fullNumber,
          
          // Cliente
          customerDocType: 'DNI',
          customerDocNumber: '12345678',
          customerName: 'Juan Pérez García',
          customerAddress: null,
          
          // Totales
          taxable: 84.75,
          igv: 15.25,
          total: 100.00,
          
          // Estado inicial
          status: 'DRAFT',
          
          // Metadata
          issueDate: new Date(),
        }
      });

      return doc;
    });

    console.log('✅ Documento creado exitosamente!\n');
    console.log(`   ID: ${document.id}`);
    console.log(`   Tipo: ${document.docType}`);
    console.log(`   Número: ${document.fullNumber}`);
    console.log(`   Cliente: ${document.customerName} (${document.customerDocType} ${document.customerDocNumber})`);
    console.log(`   Base Imponible: S/ ${document.taxable.toFixed(2)}`);
    console.log(`   IGV (18%): S/ ${document.igv.toFixed(2)}`);
    console.log(`   Total: S/ ${document.total.toFixed(2)}`);
    console.log(`   Estado: ${document.status}`);
    console.log(`   Fecha Emisión: ${document.issueDate.toLocaleString('es-PE')}\n`);

    // Crear otro documento (FACTURA)
    console.log('🧪 Creando FACTURA de prueba...\n');

    const factura = await prisma.$transaction(async (tx) => {
      const updated = await tx.sunatSettings.update({
        where: { storeId: store.id },
        data: {
          nextFacturaNumber: {
            increment: 1
          }
        }
      });

      const settings2 = await tx.sunatSettings.findUnique({
        where: { storeId: store.id }
      });

      const series = settings2.defaultFacturaSeries;
      const number = settings2.nextFacturaNumber - 1; // Ya incrementó
      const fullNumber = `${series}-${number.toString().padStart(8, '0')}`;

      return await tx.electronicDocument.create({
        data: {
          storeId: store.id,
          docType: 'FACTURA',
          series: series,
          number: number,
          fullNumber: fullNumber,
          
          customerDocType: 'RUC',
          customerDocNumber: '20123456789',
          customerName: 'EMPRESA DE PRUEBA SAC',
          customerAddress: 'Av. Javier Prado 1234, San Isidro, Lima',
          
          taxable: 423.73,
          igv: 76.27,
          total: 500.00,
          
          status: 'DRAFT',
          issueDate: new Date(),
        }
      });
    });

    console.log('✅ Factura creada exitosamente!\n');
    console.log(`   Número: ${factura.fullNumber}`);
    console.log(`   Cliente: ${factura.customerName}`);
    console.log(`   Total: S/ ${factura.total.toFixed(2)}\n`);

    // Mostrar resumen
    console.log('═══════════════════════════════════════════════');
    console.log('📊 Resumen de documentos creados:\n');
    
    const allDocs = await prisma.electronicDocument.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' }
    });

    allDocs.forEach((doc, i) => {
      console.log(`${i + 1}. ${doc.fullNumber} - ${doc.docType}`);
      console.log(`   Cliente: ${doc.customerName}`);
      console.log(`   Total: S/ ${doc.total.toFixed(2)}`);
      console.log(`   Estado: ${doc.status}\n`);
    });

    console.log('✅ Prueba completada!\n');
    console.log('📋 Para verificar en Prisma Studio:');
    console.log('   npx prisma studio\n');
    console.log('📋 Para ver el resumen:');
    console.log('   node scripts/verify-sunat.js\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestDocument();
