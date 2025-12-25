const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function validateRestore() {
  const restoredStoreId = 'cmjkvqh350001sptysqopcj6j';
  
  console.log('🔍 Validando restore de tienda:', restoredStoreId);
  console.log('================================================\n');

  try {
    // 1. Verificar Store
    const store = await prisma.store.findUnique({
      where: { id: restoredStoreId },
      include: { settings: true }
    });
    
    if (!store) {
      console.error('❌ Store no encontrada');
      return;
    }
    
    console.log('✅ Store encontrada:', store.name);
    console.log('   RUC:', store.ruc);
    console.log('   Settings:', store.settings ? '✅' : '❌');
    console.log();

    // 2. Verificar Users
    const users = await prisma.user.findMany({
      where: { storeId: restoredStoreId }
    });
    console.log('✅ Usuarios:', users.length);
    users.forEach(u => console.log(`   - ${u.email} (${u.role})`));
    console.log();

    // 3. Verificar StoreProducts
    const storeProducts = await prisma.storeProduct.findMany({
      where: { storeId: restoredStoreId },
      include: { product: true }
    });
    console.log('✅ Productos en tienda:', storeProducts.length);
    console.log('   Primeros 3:');
    storeProducts.slice(0, 3).forEach(sp => 
      console.log(`   - ${sp.product.name} | Stock: ${sp.stock} | Precio: ${sp.price}`)
    );
    console.log();

    // 4. Verificar Sales
    const sales = await prisma.sale.findMany({
      where: { storeId: restoredStoreId },
      include: { items: true }
    });
    console.log('✅ Ventas:', sales.length);
    const totalVentas = sales.reduce((sum, s) => sum + Number(s.total), 0);
    console.log(`   Total vendido: S/ ${totalVentas.toFixed(2)}`);
    console.log();

    // 5. Verificar Customers
    const customers = await prisma.customer.findMany({
      where: { storeId: restoredStoreId }
    });
    console.log('✅ Clientes:', customers.length);
    console.log();

    // 6. Verificar Receivables
    const receivables = await prisma.receivable.findMany({
      where: { storeId: restoredStoreId },
      include: { payments: true }
    });
    console.log('✅ Cuentas por cobrar:', receivables.length);
    const totalPendiente = receivables.reduce((sum, r) => sum + Number(r.balance), 0);
    console.log(`   Total pendiente: S/ ${totalPendiente.toFixed(2)}`);
    console.log();

    // 7. Verificar Shifts
    const shifts = await prisma.shift.findMany({
      where: { storeId: restoredStoreId }
    });
    console.log('✅ Turnos:', shifts.length);
    console.log();

    // 8. Verificar Movements
    const movements = await prisma.movement.findMany({
      where: { storeId: restoredStoreId }
    });
    console.log('✅ Movimientos de inventario:', movements.length);
    console.log();

    // 9. Validar integridad referencial
    console.log('🔗 Validando integridad referencial...\n');
    
    const salesWithInvalidItems = await prisma.sale.count({
      where: {
        storeId: restoredStoreId,
        items: { none: {} }
      }
    });
    console.log('   Ventas sin items:', salesWithInvalidItems === 0 ? '✅ OK' : `❌ ${salesWithInvalidItems}`);

    const orphanItems = await prisma.saleItem.count({
      where: {
        sale: { storeId: restoredStoreId },
        storeProduct: { is: null }
      }
    });
    console.log('   Items huérfanos:', orphanItems === 0 ? '✅ OK' : `❌ ${orphanItems}`);

    const orphanPayments = await prisma.receivablePayment.count({
      where: {
        storeId: restoredStoreId,
        receivable: { is: null }
      }
    });
    console.log('   Pagos huérfanos:', orphanPayments === 0 ? '✅ OK' : `❌ ${orphanPayments}`);

    console.log('\n================================================');
    console.log('✅ VALIDACIÓN COMPLETADA - Todo OK');
    
  } catch (error) {
    console.error('❌ Error en validación:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

validateRestore();
