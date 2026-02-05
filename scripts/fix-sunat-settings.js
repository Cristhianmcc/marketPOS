// Script para actualizar la configuración SUNAT con las series completas
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateSunatSettings() {
  try {
    console.log('🔧 Actualizando configuración SUNAT...\n');

    const store = await prisma.store.findFirst();
    
    if (!store) {
      console.log('❌ No hay tiendas en la DB');
      return;
    }

    const updated = await prisma.sunatSettings.update({
      where: { storeId: store.id },
      data: {
        defaultNcSeries: 'FC01',
        defaultNdSeries: 'FD01',
        nextNcNumber: 1,
        nextNdNumber: 1,
      }
    });

    console.log('✅ Configuración SUNAT actualizada:\n');
    console.log(`   Store: ${store.name}`);
    console.log(`   Entorno: ${updated.env}`);
    console.log(`   Series configuradas:`);
    console.log(`     - Facturas: ${updated.defaultFacturaSeries} (próximo: ${updated.nextFacturaNumber})`);
    console.log(`     - Boletas: ${updated.defaultBoletaSeries} (próximo: ${updated.nextBoletaNumber})`);
    console.log(`     - Notas Crédito: ${updated.defaultNcSeries} (próximo: ${updated.nextNcNumber})`);
    console.log(`     - Notas Débito: ${updated.defaultNdSeries} (próximo: ${updated.nextNdNumber})`);
    console.log('\n✅ Completado!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateSunatSettings();
