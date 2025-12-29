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

          // Si no tiene barcode, generar internalSku
          let barcode = product.barcode;
          if (!barcode) {
            // Generar SKU único: STORE_{timestamp}_{random}
            barcode = `SKU_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          }

          // Verificar si el barcode ya existe
          const existing = await tx.storeProduct.findUnique({
            where: {
              storeId_barcode: {
                storeId: session.storeId,
                barcode,
              },
            },
          });

          if (existing) {
            skipped++;
            errors.push(`Fila ${imported + skipped + 1}: Barcode ${barcode} ya existe`);
            continue;
          }

          // Crear producto
          await tx.storeProduct.create({
            data: {
              storeId: session.storeId,
              barcode,
              name: product.name,
              brand: product.brand,
              content: product.content,
              category: product.category || 'Otros',
              unitType: product.unitType,
              price: product.price ? new Prisma.Decimal(product.price) : new Prisma.Decimal(0),
              stock: product.stock ? new Prisma.Decimal(product.stock) : new Prisma.Decimal(0),
              minStock: product.minStock || null,
              isActive: product.price && product.price > 0, // Solo activo si tiene precio
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
