// src/app/api/admin/demo/reset/route.ts
// ✅ MÓDULO 17.4: Demo Mode - Resetear todos los datos demo
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

// ✅ POST /api/admin/demo/reset - Resetear datos demo (SUPERADMIN ONLY)
export async function POST() {
  try {
    const user = await getCurrentUser();
    
    // ✅ Validar permisos: Solo SUPERADMIN
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'No autorizado. Solo SUPERADMIN puede resetear Demo Mode.' },
        { status: 403 }
      );
    }

    // ✅ Verificar que la tienda esté en modo demo
    const store = await prisma.store.findUnique({
      where: { id: user.storeId },
      select: { 
        isDemoStore: true, 
        name: true,
        status: true 
      }
    });

    if (!store) {
      return NextResponse.json(
        { error: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    if (!store.isDemoStore) {
      return NextResponse.json(
        { error: 'La tienda NO está en Demo Mode. No se puede resetear.' },
        { status: 400 }
      );
    }

    // ✅ Transacción ACID: Eliminar SOLO datos demo
    const deletedData = await prisma.$transaction(async (tx) => {
      // 1. Eliminar pagos de cuentas por cobrar (solo demo)
      const deletedReceivablePayments = await tx.receivablePayment.deleteMany({
        where: {
          receivable: { storeId: user.storeId, isDemo: true }
        }
      });

      // 2. Eliminar cuentas por cobrar (solo demo)
      const deletedReceivables = await tx.receivable.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 3. Eliminar items de venta
      const deletedSaleItems = await tx.saleItem.deleteMany({
        where: {
          sale: { storeId: user.storeId, isDemo: true }
        }
      });

      // 4. Eliminar ventas
      const deletedSales = await tx.sale.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 5. Eliminar movimientos
      const deletedMovements = await tx.movement.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 6. Eliminar turnos
      const deletedShifts = await tx.shift.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 7. Eliminar clientes
      const deletedCustomers = await tx.customer.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 8. Eliminar promociones por categoría
      const deletedCategoryPromos = await tx.categoryPromotion.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 9. Eliminar promociones por volumen
      const deletedVolumePromos = await tx.volumePromotion.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 10. Eliminar promociones n-ésimo
      const deletedNthPromos = await tx.nthPromotion.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 11. Eliminar cupones
      const deletedCoupons = await tx.coupon.deleteMany({
        where: { storeId: user.storeId, isDemo: true }
      });

      // 12. Resetear stock de productos a valores iniciales
      // Obtener todos los productos de la tienda
      const storeProducts = await tx.storeProduct.findMany({
        where: { storeId: user.storeId },
        include: { product: true }
      });

      // Definir stock inicial según categoría
      const getInitialStock = (category: string) => {
        if (category === 'Bebidas') return 50;
        if (category === 'Abarrotes') return 80;
        if (category === 'Panadería') return 100;
        if (category === 'Snacks') return 40;
        if (category === 'Lácteos') return 30;
        if (category === 'Limpieza') return 20;
        if (category === 'Higiene') return 40;
        if (category === 'Conservas') return 60;
        return 50; // Default
      };

      for (const sp of storeProducts) {
        const initialStock = getInitialStock(sp.product.category);
        await tx.storeProduct.update({
          where: { id: sp.id },
          data: { stock: initialStock }
        });
      }

      // 13. Desactivar modo demo
      await tx.store.update({
        where: { id: user.storeId },
        data: { isDemoStore: false }
      });

      // 14. Registrar en audit log
      await tx.auditLog.create({
        data: {
          store: { connect: { id: user.storeId } },
          ...(user.id && { user: { connect: { id: user.id } } }),
          action: 'DEMO_RESET',
          entityType: 'STORE',
          entityId: user.storeId,
          severity: 'INFO',
          meta: {
            message: 'Demo Mode reseteado - Todos los datos eliminados',
            storeName: store.name,
            deletedData: {
              sales: deletedSales.count,
              saleItems: deletedSaleItems.count,
              movements: deletedMovements.count,
              shifts: deletedShifts.count,
              customers: deletedCustomers.count,
              receivables: deletedReceivables.count,
              receivablePayments: deletedReceivablePayments.count,
              categoryPromos: deletedCategoryPromos.count,
              volumePromos: deletedVolumePromos.count,
              nthPromos: deletedNthPromos.count,
              coupons: deletedCoupons.count,
            }
          }
        }
      });

      return {
        sales: deletedSales.count,
        saleItems: deletedSaleItems.count,
        movements: deletedMovements.count,
        shifts: deletedShifts.count,
        customers: deletedCustomers.count,
        receivables: deletedReceivables.count,
        receivablePayments: deletedReceivablePayments.count,
        categoryPromos: deletedCategoryPromos.count,
        volumePromos: deletedVolumePromos.count,
        nthPromos: deletedNthPromos.count,
        coupons: deletedCoupons.count,
        productsReset: storeProducts.length,
      };
    });

    return NextResponse.json({
      demoReset: true,
      message: 'Demo Mode reseteado exitosamente. Todos los datos eliminados.',
      deletedData,
    });

  } catch (error) {
    console.error('[Demo Reset API] Error:', error);
    return NextResponse.json(
      { error: 'Error al resetear Demo Mode' },
      { status: 500 }
    );
  }
}
