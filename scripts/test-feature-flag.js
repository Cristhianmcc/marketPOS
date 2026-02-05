// Script para diagnosticar el problema con feature flags
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testFeatureFlag() {
  try {
    console.log('🔍 Diagnosticando Feature Flags...\n');

    // 1. Verificar que hay stores
    const stores = await prisma.store.findMany({
      select: { id: true, name: true }
    });
    console.log(`📦 Tiendas encontradas: ${stores.length}`);
    stores.forEach(s => console.log(`  - ${s.name} (${s.id})`));

    if (stores.length === 0) {
      console.log('\n❌ No hay tiendas en la base de datos');
      return;
    }

    const storeId = stores[0].id;
    console.log(`\n🎯 Usando tienda: ${storeId}`);

    // 2. Verificar feature flags existentes
    const existingFlags = await prisma.featureFlag.findMany({
      where: { storeId }
    });
    console.log(`\n📋 Feature flags actuales: ${existingFlags.length}`);
    existingFlags.forEach(f => console.log(`  - ${f.key}: ${f.enabled ? '✅' : '❌'}`));

    // 3. Intentar crear un feature flag de prueba
    console.log('\n🧪 Intentando crear ENABLE_SUNAT...');
    
    try {
      const flag = await prisma.featureFlag.upsert({
        where: {
          storeId_key: {
            storeId: storeId,
            key: 'ENABLE_SUNAT',
          },
        },
        create: {
          storeId: storeId,
          key: 'ENABLE_SUNAT',
          enabled: true,
        },
        update: {
          enabled: true,
        },
      });

      console.log('✅ Feature flag creado/actualizado exitosamente:');
      console.log(`   ID: ${flag.id}`);
      console.log(`   Key: ${flag.key}`);
      console.log(`   Enabled: ${flag.enabled}`);

    } catch (error) {
      console.error('❌ Error al crear feature flag:', error.message);
      console.error('   Code:', error.code);
      if (error.meta) {
        console.error('   Meta:', JSON.stringify(error.meta, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testFeatureFlag();
