// scripts/check-current-session.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkSessions() {
  try {
    // Buscar todas las tiendas con demo mode
    const demoStores = await prisma.store.findMany({
      where: { isDemoStore: true },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    console.log('\n🎯 Tiendas con Demo Mode activo:\n');
    demoStores.forEach(store => {
      console.log(`🏪 ${store.name} (${store.id})`);
      console.log(`   Usuarios:`);
      store.users.forEach(user => {
        console.log(`   - ${user.email} (${user.name}) - ${user.role}`);
      });
      console.log('');
    });

    if (demoStores.length === 0) {
      console.log('❌ No hay tiendas con Demo Mode activo');
    } else {
      console.log('\n💡 Para ver el badge DEMO MODE en el POS:');
      console.log('   1. Cierra sesión');
      console.log(`   2. Inicia sesión con uno de los usuarios de "${demoStores[0].name}"`);
      console.log('   3. Ve al POS y verás el badge amarillo');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSessions();
