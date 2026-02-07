import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { applyBestPromotion, type Promotion } from '@/lib/promotions';
import { computeCategoryPromoDiscount } from '@/lib/categoryPromotions';
import { getActiveVolumePromotion, computeVolumePackDiscount } from '@/lib/volumePromotions';
import { computeNthPromoDiscount } from '@/lib/nthPromotions';
import { isFeatureEnabled } from '@/lib/featureFlags';

/**
 * POST /api/promotions/check-all
 * ✅ MÓDULO 18.2: Endpoint unificado de verificación de promociones
 * Combina 4 verificaciones en 1 sola llamada API para mejor rendimiento
 * 
 * Reduce latencia de addToCart de ~400ms a ~100ms
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { 
      productId, 
      productCategory,
      quantity, 
      unitPrice,
      unitType 
    } = await request.json();

    // Validaciones
    if (!productId || !quantity || !unitPrice) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: 'productId, quantity y unitPrice son requeridos' },
        { status: 400 }
      );
    }

    const storeId = session.storeId;
    const subtotal = quantity * unitPrice;
    
    // 🚀 Resultado final combinado
    const result: {
      promotion: any | null;
      categoryPromotion: any | null;
      volumePromotion: any | null;
      nthPromotion: any | null;
    } = {
      promotion: null,
      categoryPromotion: null,
      volumePromotion: null,
      nthPromotion: null,
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 1️⃣ PROMOCIÓN DE PRODUCTO (Pack, Happy Hour, etc.)
    // ──────────────────────────────────────────────────────────────────────────
    const enablePromotions = await isFeatureEnabled(storeId, 'ENABLE_PROMOTIONS' as any);
    let productPromoDiscount = 0;
    
    if (enablePromotions) {
      const promotions = await prisma.promotion.findMany({
        where: { storeId, active: true },
      });

      const promoList: Promotion[] = promotions.map((p) => ({
        id: p.id,
        type: p.type,
        name: p.name,
        active: p.active,
        productId: p.productId,
        minQty: p.minQty,
        packPrice: p.packPrice ? Number(p.packPrice) : null,
        happyStart: p.happyStart,
        happyEnd: p.happyEnd,
        happyPrice: p.happyPrice ? Number(p.happyPrice) : null,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
      }));

      const appliedPromo = applyBestPromotion(productId, quantity, unitPrice, subtotal, promoList);
      if (appliedPromo) {
        result.promotion = appliedPromo;
        productPromoDiscount = appliedPromo.promotionDiscount ?? 0;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2️⃣ PROMOCIÓN POR CATEGORÍA
    // ──────────────────────────────────────────────────────────────────────────
    const enableCategoryPromos = await isFeatureEnabled(storeId, 'ENABLE_CATEGORY_PROMOS' as any);
    let categoryPromoDiscount = 0;
    
    if (enableCategoryPromos && productCategory) {
      const subtotalAfterProductPromo = subtotal - productPromoDiscount;
      
      const categoryResult = await computeCategoryPromoDiscount({
        storeId: storeId!,
        productCategory,
        quantity,
        unitPrice,
        subtotalAfterProductPromo,
        nowLocalLima: new Date(),
      });

      if (categoryResult) {
        result.categoryPromotion = {
          categoryPromoName: categoryResult.promoSnapshot.name,
          categoryPromoType: categoryResult.promoSnapshot.type,
          categoryPromoDiscount: categoryResult.discountAmount,
        };
        categoryPromoDiscount = categoryResult.discountAmount;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3️⃣ & 4️⃣ PROMOCIÓN POR VOLUMEN y N-ÉSIMO (anti-stacking: solo aplica 1)
    // ⚠️ Solo si NO hay promoción de producto aplicada
    // ──────────────────────────────────────────────────────────────────────────
    if (productPromoDiscount === 0 && unitType) {
      const baseAfterCategoryPromo = subtotal - categoryPromoDiscount;
      
      // Verificar feature flags en paralelo
      const [enableVolumePromos, enableNthPromos] = await Promise.all([
        isFeatureEnabled(storeId, 'ENABLE_VOLUME_PROMOS' as any),
        isFeatureEnabled(storeId, 'ENABLE_NTH_PROMOS' as any),
      ]);

      let volumeDiscount = 0;
      let nthDiscount = 0;
      let volumeData: any = null;
      let nthData: any = null;

      // Calcular VOLUMEN
      if (enableVolumePromos) {
        const volumePromotion = await getActiveVolumePromotion(prisma, storeId, productId);
        if (volumePromotion) {
          const volumeResult = computeVolumePackDiscount({
            quantity,
            unitPrice,
            subtotalAfterCategoryPromo: baseAfterCategoryPromo,
            volumePromotion,
            unitType,
          });
          if (volumeResult) {
            volumeDiscount = volumeResult.discountAmount;
            volumeData = {
              volumePromoName: volumeResult.snapshot.volumePromoName,
              volumePromoQty: volumeResult.snapshot.volumePromoQty,
              volumePromoDiscount: volumeResult.discountAmount,
            };
          }
        }
      }

      // Calcular N-ÉSIMO
      if (enableNthPromos) {
        const nthPromotion = await prisma.nthPromotion.findFirst({
          where: { storeId, productId, active: true },
          orderBy: { createdAt: 'desc' },
        });
        if (nthPromotion) {
          const nthResult = computeNthPromoDiscount({
            quantity,
            unitPrice,
            baseAfterPreviousPromos: baseAfterCategoryPromo,
            nthPromotion: {
              id: nthPromotion.id,
              name: nthPromotion.name,
              type: nthPromotion.type,
              nthQty: nthPromotion.nthQty,
              percentOff: nthPromotion.percentOff,
              startsAt: nthPromotion.startsAt,
              endsAt: nthPromotion.endsAt,
              active: nthPromotion.active,
            },
            unitType,
          });
          if (nthResult) {
            nthDiscount = nthResult.discountAmount;
            nthData = {
              nthPromoName: nthResult.snapshot.nthPromoName,
              nthPromoQty: nthResult.snapshot.nthPromoQty,
              nthPromoPercent: Number(nthResult.snapshot.nthPromoPercent),
              nthPromoDiscount: nthResult.discountAmount,
            };
          }
        }
      }

      // 🛡️ REGLA ANTI-STACKING: aplicar SOLO la de mayor descuento
      if (volumeDiscount > 0 && nthDiscount > 0) {
        if (volumeDiscount >= nthDiscount) {
          result.volumePromotion = volumeData;
        } else {
          result.nthPromotion = nthData;
        }
      } else {
        // Solo una aplica (o ninguna)
        if (volumeDiscount > 0) result.volumePromotion = volumeData;
        if (nthDiscount > 0) result.nthPromotion = nthData;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking all promotions:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al verificar promociones' },
      { status: 500 }
    );
  }
}
