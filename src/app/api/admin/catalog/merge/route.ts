// src/app/api/admin/catalog/merge/route.ts
// ✅ MÓDULO 18.2: Merge manual de productos duplicados (SUPERADMIN)

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/infra/db/prisma";
import { Prisma } from "@prisma/client";

// ✅ POST /api/admin/catalog/merge
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Solo SUPERADMIN
    if (!isSuperAdmin(user.email)) {
      return NextResponse.json({ error: "Solo SUPERADMIN" }, { status: 403 });
    }

    const body = await request.json();
    const { sourceProductId, targetProductId, strategy } = body;

    // Validaciones
    if (!sourceProductId || !targetProductId) {
      return NextResponse.json(
        { error: "sourceProductId y targetProductId son requeridos" },
        { status: 400 }
      );
    }

    if (sourceProductId === targetProductId) {
      return NextResponse.json(
        { error: "No se puede hacer merge de un producto consigo mismo" },
        { status: 400 }
      );
    }

    if (strategy !== "MOVE_STORE_PRODUCTS_AND_DELETE_SOURCE") {
      return NextResponse.json(
        { error: "strategy debe ser MOVE_STORE_PRODUCTS_AND_DELETE_SOURCE" },
        { status: 400 }
      );
    }

    // Verificar que ambos productos existen
    const [sourceProduct, targetProduct] = await Promise.all([
      prisma.productMaster.findUnique({
        where: { id: sourceProductId },
        include: {
          storeProducts: true,
          promotions: true,
          volumePromotions: true,
          nthPromotions: true,
        },
      }),
      prisma.productMaster.findUnique({
        where: { id: targetProductId },
      }),
    ]);

    if (!sourceProduct) {
      return NextResponse.json(
        { error: "Producto source no encontrado" },
        { status: 404 }
      );
    }

    if (!targetProduct) {
      return NextResponse.json(
        { error: "Producto target no encontrado" },
        { status: 404 }
      );
    }

    // ✅ TRANSACCIÓN: Mover StoreProducts y referencias
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let movedStoreProducts = 0;
      let archivedStoreProducts = 0;
      let movedPromotions = 0;
      let movedVolumePromotions = 0;
      let movedNthPromotions = 0;

      // 1) Mover StoreProducts
      for (const sp of sourceProduct.storeProducts) {
        // Verificar si ya existe StoreProduct(storeId, targetProductId)
        const existingTarget = await tx.storeProduct.findUnique({
          where: {
            storeId_productId: {
              storeId: sp.storeId,
              productId: targetProductId,
            },
          },
        });

        if (existingTarget) {
          // Ya existe: archivar el source storeProduct
          await tx.storeProduct.update({
            where: { id: sp.id },
            data: { active: false },
          });
          archivedStoreProducts++;
        } else {
          // No existe: mover a targetProductId
          await tx.storeProduct.update({
            where: { id: sp.id },
            data: { productId: targetProductId },
          });
          movedStoreProducts++;
        }
      }

      // 2) Mover Promotions (si hay)
      if (sourceProduct.promotions.length > 0) {
        await tx.promotion.updateMany({
          where: { productId: sourceProductId },
          data: { productId: targetProductId },
        });
        movedPromotions = sourceProduct.promotions.length;
      }

      // 3) Mover VolumePromotions
      if (sourceProduct.volumePromotions.length > 0) {
        await tx.volumePromotion.updateMany({
          where: { productId: sourceProductId },
          data: { productId: targetProductId },
        });
        movedVolumePromotions = sourceProduct.volumePromotions.length;
      }

      // 4) Mover NthPromotions
      if (sourceProduct.nthPromotions.length > 0) {
        await tx.nthPromotion.updateMany({
          where: { productId: sourceProductId },
          data: { productId: targetProductId },
        });
        movedNthPromotions = sourceProduct.nthPromotions.length;
      }

      // 5) Marcar source como mergedIntoId
      await tx.productMaster.update({
        where: { id: sourceProductId },
        data: {
          mergedIntoId: targetProductId,
        },
      });

      // 6) Crear AuditLog
      await tx.auditLog.create({
        data: {
          action: "CATALOG_MERGE_SUCCESS",
          entityType: "CATALOG",
          entityId: sourceProductId,
          userId: user.userId,
          severity: "INFO",
          meta: {
            sourceProductId,
            targetProductId,
            sourceProductName: sourceProduct.name,
            targetProductName: targetProduct.name,
            movedStoreProducts,
            archivedStoreProducts,
            movedPromotions,
            movedVolumePromotions,
            movedNthPromotions,
          },
        },
      });

      return {
        success: true,
        movedStoreProducts,
        archivedStoreProducts,
        movedPromotions,
        movedVolumePromotions,
        movedNthPromotions,
      };
    });

    return NextResponse.json({
      success: true,
      message: "Productos unificados correctamente",
      details: result,
    });
  } catch (error) {
    console.error("❌ Error en catalog merge:", error);

    // Registrar error en AuditLog (fuera de transacción)
    try {
      const userForLog = await getCurrentUser();
      if (userForLog) {
        await prisma.auditLog.create({
          data: {
            action: "CATALOG_MERGE_FAILED",
            entityType: "CATALOG",
            userId: userForLog.userId,
            severity: "ERROR",
            meta: {
              error: error instanceof Error ? error.message : "Error desconocido",
            },
          },
        });
      }
    } catch (auditError) {
      console.error("❌ Error al crear AuditLog:", auditError);
    }

    return NextResponse.json(
      { error: "Error al unificar productos" },
      { status: 500 }
    );
  }
}
