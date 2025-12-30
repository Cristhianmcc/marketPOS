// src/app/api/admin/demo/enable/route.ts
// ✅ MÓDULO 17.4: Demo Mode - Activar modo demo y cargar datos ficticios
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { hashPassword } from '@/lib/auth';

// ✅ POST /api/admin/demo/enable - Activar demo mode (SUPERADMIN ONLY)
export async function POST() {
  try {
    const user = await getCurrentUser();
    
    // ✅ Validar permisos: Solo SUPERADMIN
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'No autorizado. Solo SUPERADMIN puede activar Demo Mode.' },
        { status: 403 }
      );
    }

    // ✅ Obtener usuario completo para tener el ID
    const fullUser = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true, storeId: true }
    });

    if (!fullUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // ✅ Verificar que la tienda no esté archivada
    const store = await prisma.store.findUnique({
      where: { id: fullUser.storeId },
      select: { status: true, isDemoStore: true, name: true }
    });

    if (!store) {
      return NextResponse.json(
        { error: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    if (store.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: 'No se puede activar Demo Mode en tienda archivada' },
        { status: 400 }
      );
    }

    if (store.isDemoStore) {
      return NextResponse.json(
        { error: 'Demo Mode ya está activo' },
        { status: 400 }
      );
    }

    // ✅ Transacción ACID: Activar demo + cargar datos
    await prisma.$transaction(async (tx) => {
      // 1. Marcar tienda como demo
      await tx.store.update({
        where: { id: fullUser.storeId },
        data: { isDemoStore: true }
      });

      // 2. Crear productos demo (10-15 productos)
      const demoProducts = [
        { name: 'Coca Cola 500ml', brand: 'Coca Cola', category: 'Bebidas', price: 3.50, stock: 50, barcode: '7750885000017' },
        { name: 'Inca Kola 1L', brand: 'Inca Kola', category: 'Bebidas', price: 6.00, stock: 30, barcode: '7750885000024' },
        { name: 'Pan Francés', brand: null, category: 'Panadería', price: 0.30, stock: 100, unitType: 'UNIT', barcode: null },
        { name: 'Arroz Superior 1kg', brand: 'Costeño', category: 'Abarrotes', price: 4.20, stock: 80, barcode: '7750885001000' },
        { name: 'Azúcar Rubia 1kg', brand: 'Cartavio', category: 'Abarrotes', price: 3.80, stock: 60, barcode: '7750885001100' },
        { name: 'Galletas Soda', brand: 'Field', category: 'Snacks', price: 1.50, stock: 40, barcode: '7750885002000' },
        { name: 'Cerveza Pilsen 650ml', brand: 'Pilsen', category: 'Bebidas Alcohólicas', price: 6.50, stock: 48, barcode: '7750885003000' },
        { name: 'Leche Evaporada', brand: 'Gloria', category: 'Lácteos', price: 4.50, stock: 36, barcode: '7750885004000' },
        { name: 'Aceite Vegetal 1L', brand: 'Primor', category: 'Abarrotes', price: 8.90, stock: 24, barcode: '7750885005000' },
        { name: 'Fideos Espagueti', brand: 'Don Vittorio', category: 'Abarrotes', price: 2.80, stock: 50, barcode: '7750885006000' },
        { name: 'Huevos (Docena)', brand: null, category: 'Abarrotes', price: 8.00, stock: 30, unitType: 'UNIT', barcode: null },
        { name: 'Detergente en Polvo', brand: 'Ariel', category: 'Limpieza', price: 12.90, stock: 20, barcode: '7750885007000' },
        { name: 'Papel Higiénico x4', brand: 'Elite', category: 'Higiene', price: 5.50, stock: 40, barcode: '7750885008000' },
        { name: 'Atún en Lata', brand: 'Florida', category: 'Conservas', price: 3.20, stock: 60, barcode: '7750885009000' },
        { name: 'Yogurt Fresa 1L', brand: 'Gloria', category: 'Lácteos', price: 7.50, stock: 25, barcode: '7750885010000' },
      ];

      const createdProducts: any[] = [];
      for (const product of demoProducts) {
        // Usar upsert para reutilizar productos si ya existen
        const productMaster = await tx.productMaster.upsert({
          where: {
            barcode: product.barcode || `DEMO-${Math.random().toString(36).substr(2, 9)}`
          },
          create: {
            name: product.name,
            brand: product.brand,
            category: product.category,
            unitType: (product.unitType || 'UNIT') as 'UNIT' | 'KG',
            barcode: product.barcode,
            internalSku: `DEMO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          },
          update: {
            // Actualizar campos básicos si el producto ya existe
            name: product.name,
            brand: product.brand,
            category: product.category,
          }
        });

        // Verificar si ya existe StoreProduct para esta tienda
        const existingStoreProduct = await tx.storeProduct.findFirst({
          where: {
            storeId: fullUser.storeId,
            productId: productMaster.id
          },
          include: {
            product: true
          }
        });

        const storeProduct = existingStoreProduct || await tx.storeProduct.create({
          data: {
            storeId: fullUser.storeId,
            productId: productMaster.id,
            price: product.price,
            stock: product.stock,
            active: true,
          },
          include: {
            product: true
          }
        });

        createdProducts.push(storeProduct);
      }

      // 3. Marcar algunos como Quick Sell (primeros 4)
      for (let i = 0; i < Math.min(4, createdProducts.length); i++) {
        await tx.productMaster.update({
          where: { id: createdProducts[i].productId },
          data: {
            isQuickSell: true,
            quickSellOrder: i + 1
          }
        });
      }

      // 4. Crear cliente demo
      const demoCustomer = await tx.customer.create({
        data: {
          storeId: fullUser.storeId,
          name: 'Cliente Demo',
          phone: '999000111',
          isDemo: true,
        }
      });

      // 5. Crear turno demo cerrado
      const closedShift = await tx.shift.create({
        data: {
          store: { connect: { id: fullUser.storeId } },
          openedBy: { connect: { id: fullUser.id } },
          closedBy: { connect: { id: fullUser.id } },
          openingCash: 100.00,
          closingCash: 150.00,
          difference: 0,
          openedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Ayer
          closedAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
          isDemo: true,
        }
      });

      // 6. Crear turno demo abierto
      const openShift = await tx.shift.create({
        data: {
          store: { connect: { id: fullUser.storeId } },
          openedBy: { connect: { id: fullUser.id } },
          openingCash: 150.00,
          openedAt: new Date(),
          isDemo: true,
        }
      });

      // 7. Crear ventas demo
      // Venta 1: CASH simple
      const sale1 = await tx.sale.create({
        data: {
          storeId: fullUser.storeId,
          userId: fullUser.id,
          shiftId: closedShift.id,
          saleNumber: 99991,
          paymentMethod: 'CASH',
          subtotal: 14.60,
          tax: 0,
          total: 15.00,
          amountPaid: 20.00,
          changeAmount: 5.00,
          isDemo: true,
          createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
          items: {
            create: [
              {
                storeProductId: createdProducts[0].id,
                productName: 'Coca Cola 500ml',
                unitType: 'UNIT',
                quantity: 2,
                unitPrice: 3.50,
                subtotal: 7.00,
                discountAmount: 0,
                totalLine: 7.00,
              },
              {
                storeProductId: createdProducts[1].id,
                productName: 'Inca Kola 1L',
                unitType: 'UNIT',
                quantity: 1,
                unitPrice: 6.00,
                subtotal: 6.00,
                discountAmount: 0,
                totalLine: 6.00,
              },
              {
                storeProductId: createdProducts[2].id,
                productName: 'Pan Francés',
                unitType: 'UNIT',
                quantity: 2,
                unitPrice: 0.30,
                subtotal: 0.60,
                discountAmount: 0,
                totalLine: 0.60,
              },
              {
                storeProductId: createdProducts[3].id,
                productName: 'Arroz Superior 1kg',
                unitType: 'UNIT',
                quantity: 1,
                unitPrice: 4.20,
                subtotal: 4.20,
                discountAmount: 2.80,
                totalLine: 1.40,
              },
            ]
          }
        }
      });

      // Crear movements para venta 1
      await tx.movement.createMany({
        data: [
          { storeId: fullUser.storeId, storeProductId: createdProducts[0].id, type: 'SALE', quantity: -2, createdById: fullUser.id, isDemo: true },
          { storeId: fullUser.storeId, storeProductId: createdProducts[1].id, type: 'SALE', quantity: -1, createdById: fullUser.id, isDemo: true },
          { storeId: fullUser.storeId, storeProductId: createdProducts[2].id, type: 'SALE', quantity: -2, createdById: fullUser.id, isDemo: true },
          { storeId: fullUser.storeId, storeProductId: createdProducts[3].id, type: 'SALE', quantity: -1, createdById: fullUser.id, isDemo: true },
        ]
      });

      // Venta 2: YAPE
      await tx.sale.create({
        data: {
          storeId: fullUser.storeId,
          userId: fullUser.id,
          shiftId: closedShift.id,
          saleNumber: 99992,
          paymentMethod: 'YAPE',
          subtotal: 25.50,
          tax: 0,
          total: 25.50,
          amountPaid: 25.50,
          changeAmount: 0,
          isDemo: true,
          createdAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
          items: {
            create: [
              {
                storeProductId: createdProducts[6].id,
                productName: 'Cerveza Pilsen 650ml',
                unitType: 'UNIT',
                quantity: 3,
                unitPrice: 6.50,
                subtotal: 19.50,
                discountAmount: 0,
                totalLine: 19.50,
              },
              {
                storeProductId: createdProducts[5].id,
                productName: 'Galletas Soda',
                unitType: 'UNIT',
                quantity: 4,
                unitPrice: 1.50,
                subtotal: 6.00,
                discountAmount: 0,
                totalLine: 6.00,
              },
            ]
          }
        }
      });

      // Crear movements para venta 2
      await tx.movement.createMany({
        data: [
          { storeId: fullUser.storeId, storeProductId: createdProducts[6].id, type: 'SALE', quantity: -3, createdById: fullUser.id, isDemo: true },
          { storeId: fullUser.storeId, storeProductId: createdProducts[5].id, type: 'SALE', quantity: -4, createdById: fullUser.id, isDemo: true },
        ]
      });

      // Venta 3: FIADO
      const sale3 = await tx.sale.create({
        data: {
          storeId: fullUser.storeId,
          userId: fullUser.id,
          shiftId: closedShift.id,
          saleNumber: 99993,
          paymentMethod: 'FIADO',
          customerId: demoCustomer.id,
          subtotal: 30.00,
          tax: 0,
          total: 30.00,
          amountPaid: 0,
          changeAmount: 0,
          isDemo: true,
          createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
          items: {
            create: [
              {
                storeProductId: createdProducts[8].id,
                productName: 'Aceite Vegetal 1L',
                unitType: 'UNIT',
                quantity: 2,
                unitPrice: 8.90,
                subtotal: 17.80,
                discountAmount: 0,
                totalLine: 17.80,
              },
              {
                storeProductId: createdProducts[9].id,
                productName: 'Fideos Espagueti',
                unitType: 'UNIT',
                quantity: 4,
                unitPrice: 2.80,
                subtotal: 11.20,
                discountAmount: 0,
                totalLine: 11.20,
              },
              {
                storeProductId: createdProducts[4].id,
                productName: 'Azúcar Rubia 1kg',
                unitType: 'UNIT',
                quantity: 1,
                unitPrice: 3.80,
                subtotal: 3.80,
                discountAmount: 2.80,
                totalLine: 1.00,
              },
            ]
          }
        }
      });

      // Crear movements para venta 3
      await tx.movement.createMany({
        data: [
          { storeId: fullUser.storeId, storeProductId: createdProducts[8].id, type: 'SALE', quantity: -2, createdById: fullUser.id, isDemo: true },
          { storeId: fullUser.storeId, storeProductId: createdProducts[9].id, type: 'SALE', quantity: -4, createdById: fullUser.id, isDemo: true },
          { storeId: fullUser.storeId, storeProductId: createdProducts[4].id, type: 'SALE', quantity: -1, createdById: fullUser.id, isDemo: true },
        ]
      });

      // Crear cuenta por cobrar para venta FIADO
      await tx.receivable.create({
        data: {
          storeId: fullUser.storeId,
          customerId: demoCustomer.id,
          saleId: sale3.id,
          originalAmount: 30.00,
          balance: 15.00,
          status: 'OPEN',
          createdById: fullUser.id,
          isDemo: true,
          payments: {
            create: {
              storeId: fullUser.storeId,
              shiftId: closedShift.id,
              amount: 15.00,
              method: 'CASH',
              createdById: fullUser.id,
              notes: 'Pago inicial demo'
            }
          }
        }
      });

      // 8. Crear promoción por categoría demo
      await tx.categoryPromotion.create({
        data: {
          storeId: fullUser.storeId,
          name: 'Promo Demo Bebidas',
          category: 'Bebidas',
          type: 'PERCENT',
          value: 10,
          active: true,
          isDemo: true,
          startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }
      });

      // 9. Crear promoción por volumen demo
      await tx.volumePromotion.create({
        data: {
          storeId: fullUser.storeId,
          productId: createdProducts[5].productId, // Galletas
          name: 'Promo Demo 6x5',
          type: 'FIXED_PRICE',
          requiredQty: 6,
          packPrice: 20.00,
          active: true,
          isDemo: true,
          startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }
      });

      // 10. Crear cupón demo
      await tx.coupon.create({
        data: {
          storeId: fullUser.storeId,
          code: 'DEMO10',
          type: 'PERCENT',
          value: 10,
          minTotal: 20,
          active: true,
          isDemo: true,
          startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }
      });

      // 11. Registrar en audit log
      await tx.auditLog.create({
        data: {
          store: {
            connect: { id: fullUser.storeId }
          },
          user: {
            connect: { id: fullUser.id }
          },
          action: 'DEMO_ENABLE',
          entityType: 'STORE',
          entityId: fullUser.storeId,
          severity: 'WARN',
          meta: {
            message: 'Demo Mode activado',
            storeName: store.name,
            productsCreated: createdProducts.length,
            salesCreated: 3,
          }
        }
      });
    });

    return NextResponse.json({
      demoEnabled: true,
      message: 'Demo Mode activado exitosamente. Datos ficticios cargados.',
    });

  } catch (error) {
    console.error('[Demo Enable API] Error:', error);
    return NextResponse.json(
      { error: 'Error al activar Demo Mode' },
      { status: 500 }
    );
  }
}
