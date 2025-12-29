// src/app/api/onboarding/import-csv/confirm/route.ts
// ✅ MÓDULO 16.2: Onboarding - Confirmar import CSV

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { createAuditLog } from '@/domain/audit-log/audit-log-service';
import { Prisma } from '@prisma/client';

interface ProductToImport {
  barcode: string | null;
  name: string;
  brand: string | null;
  content: string | null;
  category: string;
  unitType: 'UNIT' | 'KG';
  price: number | null;
  stock: number | null;
  minStock: number | null;
}

/**
 * POST /api/onboarding/import-csv/confirm
 * Importa los productos validados a la base de datos
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    // Solo OWNER
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede importar productos' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { products } = body as { products: ProductToImport[] };

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: 'No se recibieron productos para importar' },
        { status: 400 }
      );
    }

    // Limitar a 500 productos por import
    if (products.length > 500) {
      return NextResponse.json(
        { error: 'Máximo 500 productos por importación' },
        { status: 400 }
      );
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Usar transacción
    await prisma.$transaction(async (tx) => {
      for (const product of products) {
        try {
          // Validar nombre
          if (!product.name || product.name.length < 2) {
            skipped++;
            errors.push(`Fila ${imported + skipped + 1}: Nombre inválido`);
            continue;
          }

          // Generar internalSku único
          const internalSku = product.barcode || `SKU_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

          // Buscar si ya existe un ProductMaster con este barcode/SKU
          let productMaster;
          if (product.barcode) {
            productMaster = await tx.productMaster.findUnique({
              where: { barcode: product.barcode },
            });
          }

          // Si no existe, crear ProductMaster
          if (!productMaster) {
            productMaster = await tx.productMaster.create({
              data: {
                barcode: product.barcode || null,
                internalSku,
                name: product.name,
                brand: product.brand || null,
                content: product.content || null,
                category: product.category || 'Otros',
                unitType: product.unitType,
              },
            });
          }

          // Verificar si ya existe StoreProduct para esta tienda
          const existingStoreProduct = await tx.storeProduct.findUnique({
            where: {
              storeId_productId: {
                storeId: session.storeId,
                productId: productMaster.id,
              },
            },
          });

          if (existingStoreProduct) {
            skipped++;
            errors.push(`Fila ${imported + skipped + 1}: Producto ${product.name} ya existe en tu tienda`);
            continue;
          }

          // Crear StoreProduct (precio y stock por tienda)
          const isActive = product.price ? product.price > 0 : false;
          
          await tx.storeProduct.create({
            data: {
              storeId: session.storeId,
              productId: productMaster.id,
              price: product.price ? new Prisma.Decimal(product.price) : new Prisma.Decimal(0),
              stock: product.stock ? new Prisma.Decimal(product.stock) : new Prisma.Decimal(0),
              minStock: product.minStock ? new Prisma.Decimal(product.minStock) : null,
              active: isActive,
            },
          });

          imported++;
        } catch (error) {
          console.error(`Error importing product:`, error);
          skipped++;
          errors.push(`Fila ${imported + skipped + 1}: Error al importar`);
        }
      }
    });

    // Auditoría
    await createAuditLog({
      storeId: session.storeId,
      userId: session.userId,
      action: 'ONBOARDING_IMPORT_COMPLETED',
      entityType: 'PRODUCT',
      entityId: session.storeId,
      severity: 'INFO',
      meta: {
        imported,
        skipped,
        total: products.length,
      },
    });

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 20), // Máximo 20 errores en respuesta
      message: `Importados: ${imported}, Omitidos: ${skipped}`,
    });
  } catch (error: any) {
    console.error('Error confirming CSV import:', error);
    
    // Auditoría de error
    try {
      const session = await getSessionOrThrow();
      await createAuditLog({
        storeId: session.storeId,
        userId: session.userId,
        action: 'ONBOARDING_IMPORT_FAILED',
        entityType: 'PRODUCT',
        entityId: session.storeId,
        severity: 'ERROR',
        meta: {
          error: error.message,
        },
      });
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }

    return NextResponse.json(
      { error: error.message || 'Error al importar productos' },
      { status: 500 }
    );
  }
}
