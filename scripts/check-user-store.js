// scripts/check-user-store.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUserStore() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'owner@bodega.com' },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            isDemoStore: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      console.log('❌ Usuario no encontrado');
      return;
    }

    console.log('\n👤 Usuario: owner@bodega.com\n');
    console.log(`   Nombre: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Store ID: ${user.storeId}`);
    console.log('');
    console.log(`🏪 Tienda: ${user.store.name}`);
    console.log(`   Status: ${user.store.status}`);
    console.log(`   Demo Mode: ${user.store.isDemoStore ? '✅ ACTIVO' : '❌ INACTIVO'}`);
    console.log('');

    if (user.store.isDemoStore) {
      console.log('✅ El usuario pertenece a una tienda con Demo Mode ACTIVO');
      console.log('✅ El badge debería aparecer en el POS');
      console.log('');
      console.log('🔧 Si no aparece, intenta:');
      console.log('   1. Recargar la página del POS (F5 o Ctrl+R)');
      console.log('   2. Abrir DevTools (F12) → Console y buscar errores');
      console.log('   3. Verificar que /api/store devuelve isDemoStore: true');
    } else {
      console.log('❌ La tienda NO tiene Demo Mode activo');
      console.log('💡 Ve a /admin/demo y activa Demo Mode');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserStore();
