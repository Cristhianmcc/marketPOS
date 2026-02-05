// Script para configurar SUNAT con datos completos y habilitar el sistema
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function configureSunat() {
  try {
    console.log('⚙️  Configurando SUNAT con datos completos...\n');

    const store = await prisma.store.findFirst();
    
    if (!store) {
      console.log('❌ No hay tiendas');
      return;
    }

    // Actualizar SunatSettings con datos completos
    const updated = await prisma.sunatSettings.update({
      where: { storeId: store.id },
      data: {
        enabled: true, // ✅ Habilitar SUNAT
        ruc: '20123456789',
        razonSocial: 'BODEGA EL MERCADO SAC',
        address: 'Av. Los Olivos 123, Lima, Perú',
        ubigeo: '150101', // Lima, Lima, Lima
        solUser: 'MODDATOS',
        solPass: 'MODDATOS', // Para ambiente BETA
        env: 'BETA',
      }
    });

    console.log('✅ Configuración SUNAT actualizada:\n');
    console.log(`   Store: ${store.name}`);
    console.log(`   RUC: ${updated.ruc}`);
    console.log(`   Razón Social: ${updated.razonSocial}`);
    console.log(`   Dirección: ${updated.address}`);
    console.log(`   Ubigeo: ${updated.ubigeo}`);
    console.log(`   Entorno: ${updated.env}`);
    console.log(`   Usuario SOL: ${updated.solUser}`);
    console.log(`   Habilitado: ${updated.enabled ? '✅ SÍ' : '❌ NO'}`);
    console.log('\n');
    console.log(`   Series configuradas:`);
    console.log(`     - Facturas: ${updated.defaultFacturaSeries} (próximo: ${updated.nextFacturaNumber})`);
    console.log(`     - Boletas: ${updated.defaultBoletaSeries} (próximo: ${updated.nextBoletaNumber})`);
    console.log(`     - Notas Crédito: ${updated.defaultNcSeries} (próximo: ${updated.nextNcNumber})`);
    console.log(`     - Notas Débito: ${updated.defaultNdSeries} (próximo: ${updated.nextNdNumber})`);
    
    console.log('\n✅ SUNAT está listo para generar payloads fiscales!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

configureSunat();
