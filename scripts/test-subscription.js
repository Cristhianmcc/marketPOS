const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Listar tiendas
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, status: true },
  });
  console.log('📦 Tiendas existentes:', JSON.stringify(stores, null, 2));

  if (stores.length === 0) {
    console.log('❌ No hay tiendas. Necesitas crear una primero.');
    return;
  }

  const storeId = stores[0].id;
  console.log(`\n🎯 Creando suscripción TRIAL para tienda: ${stores[0].name} (${storeId})`);

  // Crear suscripción de prueba
  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + 30); // 30 días de trial

  const currentPeriodEnd = new Date(now);
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

  const graceEndsAt = new Date(currentPeriodEnd);
  graceEndsAt.setDate(graceEndsAt.getDate() + 5); // 5 días de gracia

  const subscription = await prisma.subscription.upsert({
    where: { storeId },
    create: {
      storeId,
      planCode: 'STARTER',
      status: 'TRIAL',
      startAt: now,
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd,
      graceEndsAt,
      priceAmount: 49.0,
      priceCurrency: 'PEN',
      billingCycle: 'MONTHLY',
    },
    update: {
      planCode: 'STARTER',
      status: 'TRIAL',
      trialEndsAt,
      currentPeriodEnd,
      graceEndsAt,
    },
  });

  console.log('✅ Suscripción creada:', JSON.stringify(subscription, null, 2));

  // Verificar estado efectivo
  const { computeEffectiveStatus, getDaysUntilExpiration } = require('../src/lib/subscriptionStatus');
  const effectiveStatus = computeEffectiveStatus(subscription);
  const daysRemaining = getDaysUntilExpiration(subscription);

  console.log(`\n📊 Estado efectivo: ${effectiveStatus}`);
  console.log(`⏳ Días restantes: ${daysRemaining}`);

  console.log('\n✅ Sistema de suscripciones listo. Puedes:');
  console.log('   1. Ver en: http://localhost:3000/settings/billing');
  console.log('   2. Panel admin: http://localhost:3000/admin/billing');
  console.log('   3. Probar bloqueo: Actualiza currentPeriodEnd a fecha pasada');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
