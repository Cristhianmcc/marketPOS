/**
 * Script de migración: Sincronizar Feature Flags con Planes
 * 
 * Este script actualiza los feature flags de TODAS las tiendas
 * para que coincidan con las capacidades de su plan actual.
 * 
 * Uso:
 *   npx tsx scripts/sync-feature-flags.ts
 */

import { prisma } from '../src/infra/db/prisma';
import { syncFeatureFlagsFromPlan } from '../src/lib/featureFlags';

async function main() {
  console.log('🔄 Iniciando sincronización de Feature Flags...\n');

  // Obtener todas las tiendas con suscripción
  const subscriptions = await prisma.subscription.findMany({
    select: {
      storeId: true,
      planCode: true,
      store: {
        select: {
          name: true,
        },
      },
    },
  });

  console.log(`📊 Encontradas ${subscriptions.length} tiendas con suscripción\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const sub of subscriptions) {
    try {
      console.log(`🔧 Sincronizando: ${sub.store.name} (Plan: ${sub.planCode})`);
      
      await syncFeatureFlagsFromPlan(sub.storeId);
      
      console.log(`   ✅ Sincronizado exitosamente\n`);
      successCount++;
      
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      errorCount++;
    }
  }

  console.log('\n📈 Resumen:');
  console.log(`   ✅ Exitosos: ${successCount}`);
  console.log(`   ❌ Errores: ${errorCount}`);
  console.log(`   📊 Total: ${subscriptions.length}`);

  if (errorCount === 0) {
    console.log('\n🎉 Sincronización completada sin errores!');
  } else {
    console.log('\n⚠️  Completado con algunos errores');
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
