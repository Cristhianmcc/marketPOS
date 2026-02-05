// Script para verificar si hay inconsistencia entre sesión y DB
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStores() {
  try {
    console.log('🔍 Verificando stores en la base de datos...\n');

    const stores = await prisma.store.findMany({
      select: { 
        id: true, 
        name: true,
        createdAt: true
      }
    });

    console.log(`📦 Stores encontradas: ${stores.length}\n`);
    
    if (stores.length === 0) {
      console.log('❌ No hay stores en la base de datos');
      console.log('💡 Ejecuta: npx tsx prisma/seed.ts\n');
    } else {
      stores.forEach(s => {
        console.log(`ID: ${s.id}`);
        console.log(`Nombre: ${s.name}`);
        console.log(`Creada: ${s.createdAt}`);
        console.log('---');
      });

      console.log('\n💡 Si el error persiste, cierra sesión y vuelve a iniciar sesión.');
      console.log('   La sesión probablemente tiene un storeId antiguo.\n');
    }

    // Verificar usuarios
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        storeId: true,
        store: {
          select: { name: true }
        }
      }
    });

    console.log(`\n👥 Usuarios encontrados: ${users.length}\n`);
    users.forEach(u => {
      console.log(`Email: ${u.email}`);
      console.log(`Nombre: ${u.name}`);
      console.log(`StoreID: ${u.storeId}`);
      console.log(`Store: ${u.store?.name || 'NO ENCONTRADA ❌'}`);
      console.log('---');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStores();
