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
      select: { status: true, isDemoStore: true, name: true, businessProfile: true }
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

      // 2. Crear productos demo según perfil de negocio
      const isPharma = store.businessProfile === 'BOTICA' || store.businessProfile === 'FARMACIA';
      const demoProducts = isPharma ? [
        // índices usados en ventas: [0][1][2][3] en venta1, [5][6] en venta2, [4][8][9] en venta3
        { name: 'Paracetamol 500mg x 10 tab',       brand: 'Genérico',   category: 'Analgésicos y Antiinflamatorios', price: 2.50,  stock: 100, barcode: '7750999001001' },
        { name: 'Ibuprofeno 400mg x 10 tab',         brand: 'Genérico',   category: 'Analgésicos y Antiinflamatorios', price: 3.20,  stock: 80,  barcode: '7750999001002' },
        { name: 'Amoxicilina 500mg x 12 cap',        brand: 'Genérico',   category: 'Antibióticos',                   price: 8.50,  stock: 60,  barcode: '7750999001003' },
        { name: 'Gripazol Forte x 10 tab',           brand: 'Gripazol',   category: 'Antigripales y Tos',             price: 5.90,  stock: 50,  barcode: '7750999001004' },
        { name: 'Omeprazol 20mg x 14 cap',           brand: 'Genérico',   category: 'Antiácidos y Digestivos',         price: 4.80,  stock: 70,  barcode: '7750999001005' },
        { name: 'Vitamina C 1g x 10 tab',            brand: 'Genérico',   category: 'Vitaminas y Suplementos',        price: 3.50,  stock: 90,  barcode: '7750999001006' },
        { name: 'Loratadina 10mg x 10 tab',          brand: 'Genérico',   category: 'Antigripales y Tos',             price: 4.20,  stock: 60,  barcode: '7750999001007' },
        { name: 'Voltaren Emulgel 30g',              brand: 'Voltaren',   category: 'Uso Tópico',                     price: 18.00, stock: 20,  barcode: '7750999001008' },
        { name: 'Agua Oxigenada 100ml',              brand: null,         category: 'Cuidado Personal',               price: 2.50,  stock: 50,  barcode: '7750999001009' },
        { name: 'Nospir x 12 cap',                   brand: 'Nospir',     category: 'Antigripales y Tos',             price: 6.80,  stock: 45,  barcode: '7750999001010' },
        { name: 'Paracetamol Jarabe 120mg/5ml 60ml', brand: 'Genérico',   category: 'Infantil y Bebés',               price: 9.80,  stock: 30,  barcode: '7750999001011' },
        { name: 'Termómetro Digital',                brand: null,         category: 'Cuidado Personal',               price: 25.00, stock: 15,  barcode: '7750999001012' },
        { name: 'Venda Elástica 4"',                 brand: null,         category: 'Cuidado Personal',               price: 8.00,  stock: 25,  barcode: '7750999001013' },
        { name: 'Alcohol 70° x 1L',                  brand: null,         category: 'Cuidado Personal',               price: 6.00,  stock: 40,  barcode: '7750999001014' },
        { name: 'Suero Oral Hidratante 500ml',        brand: null,         category: 'Antiácidos y Digestivos',         price: 2.80,  stock: 60,  barcode: '7750999001015' },
      ] : [
        { name: 'Coca Cola 500ml',       brand: 'Coca Cola',    category: 'Bebidas',            price: 3.50,  stock: 50,  barcode: '7750885000017' },
        { name: 'Inca Kola 1L',          brand: 'Inca Kola',    category: 'Bebidas',            price: 6.00,  stock: 30,  barcode: '7750885000024' },
        { name: 'Pan Francés',           brand: null,           category: 'Panadería',          price: 0.30,  stock: 100, barcode: null },
        { name: 'Arroz Superior 1kg',    brand: 'Costeño',      category: 'Abarrotes',          price: 4.20,  stock: 80,  barcode: '7750885001000' },
        { name: 'Azúcar Rubia 1kg',      brand: 'Cartavio',     category: 'Abarrotes',          price: 3.80,  stock: 60,  barcode: '7750885001100' },
        { name: 'Galletas Soda',         brand: 'Field',        category: 'Snacks',             price: 1.50,  stock: 40,  barcode: '7750885002000' },
        { name: 'Cerveza Pilsen 650ml',  brand: 'Pilsen',       category: 'Bebidas Alcohólicas',price: 6.50,  stock: 48,  barcode: '7750885003000' },
        { name: 'Leche Evaporada',       brand: 'Gloria',       category: 'Lácteos',            price: 4.50,  stock: 36,  barcode: '7750885004000' },
        { name: 'Aceite Vegetal 1L',     brand: 'Primor',       category: 'Abarrotes',          price: 8.90,  stock: 24,  barcode: '7750885005000' },
        { name: 'Fideos Espagueti',      brand: 'Don Vittorio', category: 'Abarrotes',          price: 2.80,  stock: 50,  barcode: '7750885006000' },
        { name: 'Huevos (Docena)',       brand: null,           category: 'Abarrotes',          price: 8.00,  stock: 30,  barcode: null },
        { name: 'Detergente en Polvo',   brand: 'Ariel',        category: 'Limpieza',           price: 12.90, stock: 20,  barcode: '7750885007000' },
        { name: 'Papel Higiénico x4',   brand: 'Elite',        category: 'Higiene',            price: 5.50,  stock: 40,  barcode: '7750885008000' },
        { name: 'Atún en Lata',          brand: 'Florida',      category: 'Conservas',          price: 3.20,  stock: 60,  barcode: '7750885009000' },
        { name: 'Yogurt Fresa 1L',       brand: 'Gloria',       category: 'Lácteos',            price: 7.50,  stock: 25,  barcode: '7750885010000' },
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
            unitType: 'UNIT' as 'UNIT' | 'KG',
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
          subtotal: isPharma ? 25.20 : 14.60,
          tax: 0,
          total: isPharma ? 28.30 : 15.00,
          amountPaid: isPharma ? 30.00 : 20.00,
          changeAmount: isPharma ? 1.70 : 5.00,
          isDemo: true,
          createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
          items: {
            create: [
              {
                storeProductId: createdProducts[0].id,
                productName: demoProducts[0].name,
                unitType: 'UNIT',
                quantity: 2,
                unitPrice: demoProducts[0].price,
                subtotal: demoProducts[0].price * 2,
                discountAmount: 0,
                totalLine: demoProducts[0].price * 2,
              },
              {
                storeProductId: createdProducts[1].id,
                productName: demoProducts[1].name,
                unitType: 'UNIT',
                quantity: 1,
                unitPrice: demoProducts[1].price,
                subtotal: demoProducts[1].price,
                discountAmount: 0,
                totalLine: demoProducts[1].price,
              },
              {
                storeProductId: createdProducts[2].id,
                productName: demoProducts[2].name,
                unitType: 'UNIT',
                quantity: 2,
                unitPrice: demoProducts[2].price,
                subtotal: demoProducts[2].price * 2,
                discountAmount: 0,
                totalLine: demoProducts[2].price * 2,
              },
              {
                storeProductId: createdProducts[3].id,
                productName: demoProducts[3].name,
                unitType: 'UNIT',
                quantity: 1,
                unitPrice: demoProducts[3].price,
                subtotal: demoProducts[3].price,
                discountAmount: isPharma ? 2.80 : 2.80,
                totalLine: demoProducts[3].price - 2.80,
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
          subtotal: isPharma ? 26.60 : 25.50,
          tax: 0,
          total: isPharma ? 26.60 : 25.50,
          amountPaid: isPharma ? 26.60 : 25.50,
          changeAmount: 0,
          isDemo: true,
          createdAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
          items: {
            create: [
              {
                storeProductId: createdProducts[6].id,
                productName: demoProducts[6].name,
                unitType: 'UNIT',
                quantity: 3,
                unitPrice: demoProducts[6].price,
                subtotal: demoProducts[6].price * 3,
                discountAmount: 0,
                totalLine: demoProducts[6].price * 3,
              },
              {
                storeProductId: createdProducts[5].id,
                productName: demoProducts[5].name,
                unitType: 'UNIT',
                quantity: 4,
                unitPrice: demoProducts[5].price,
                subtotal: demoProducts[5].price * 4,
                discountAmount: 0,
                totalLine: demoProducts[5].price * 4,
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
          subtotal: isPharma ? 34.20 : 30.00,
          tax: 0,
          total: isPharma ? 34.20 : 30.00,
          amountPaid: 0,
          changeAmount: 0,
          isDemo: true,
          createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
          items: {
            create: [
              {
                storeProductId: createdProducts[8].id,
                productName: demoProducts[8].name,
                unitType: 'UNIT',
                quantity: 2,
                unitPrice: demoProducts[8].price,
                subtotal: demoProducts[8].price * 2,
                discountAmount: 0,
                totalLine: demoProducts[8].price * 2,
              },
              {
                storeProductId: createdProducts[9].id,
                productName: demoProducts[9].name,
                unitType: 'UNIT',
                quantity: 4,
                unitPrice: demoProducts[9].price,
                subtotal: demoProducts[9].price * 4,
                discountAmount: 0,
                totalLine: demoProducts[9].price * 4,
              },
              {
                storeProductId: createdProducts[4].id,
                productName: demoProducts[4].name,
                unitType: 'UNIT',
                quantity: 1,
                unitPrice: demoProducts[4].price,
                subtotal: demoProducts[4].price,
                discountAmount: 2.80,
                totalLine: demoProducts[4].price - 2.80,
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
          originalAmount: isPharma ? 34.20 : 30.00,
          balance: isPharma ? 17.10 : 15.00,
          status: 'OPEN',
          createdById: fullUser.id,
          isDemo: true,
          payments: {
            create: {
              storeId: fullUser.storeId,
              shiftId: closedShift.id,
              amount: isPharma ? 17.10 : 15.00,
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
          name: isPharma ? 'Promo Demo Analgésicos 10%' : 'Promo Demo Bebidas',
          category: isPharma ? 'Analgésicos y Antiinflamatorios' : 'Bebidas',
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
          productId: createdProducts[5].productId, // Galletas (bodega) / Vitamina C (pharma)
          name: isPharma ? 'Promo Demo Vitaminas 6×20' : 'Promo Demo 6x5',
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
