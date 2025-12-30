import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma, FeatureFlagKey } from '@prisma/client';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';
import { applyBestPromotion, type Promotion } from '@/lib/promotions';
import {
  normalizeCouponCode,
  validateAndComputeCouponDiscount,
  type CouponError,
} from '@/lib/coupons';
import { computeCategoryPromoDiscount } from '@/lib/categoryPromotions'; // ✅ Módulo 14.2-B
import { computeVolumePackDiscount, getActiveVolumePromotion } from '@/lib/volumePromotions'; // ✅ Módulo 14.2-C1
import { computeNthPromoDiscount, getActiveNthPromotion } from '@/lib/nthPromotions'; // ✅ Módulo 14.2-C2
import { logAudit, getRequestMetadata } from '@/lib/auditLog'; // ✅ MÓDULO 15: Auditoría
import { requireFeature, isFeatureEnabled, FeatureDisabledError } from '@/lib/featureFlags'; // ✅ MÓDULO 15: Feature Flags
import { 
  validateItemsCount,
  validateDiscountPercent,
  validateManualDiscountAmount,
  validateSaleTotal,
  validateReceivableBalance,
  LimitExceededError
} from '@/lib/operationalLimits'; // ✅ MÓDULO 15 - FASE 3: Límites Operativos
import { checkRateLimit } from '@/lib/rateLimit'; // ✅ MÓDULO 16.1: Rate Limiting
import { getIdempotentResult, saveIdempotentResult } from '@/lib/idempotency'; // ✅ MÓDULO 16.1: Idempotency
import { acquireCheckoutLock, releaseCheckoutLock } from '@/lib/checkoutLock'; // ✅ MÓDULO 16.1: Checkout Lock

const shiftRepo = new PrismaShiftRepository();

interface CheckoutItem {
  storeProductId: string;
  quantity: number;
  unitPrice: number;
  // Descuentos (Módulo 14)
  discountType?: 'PERCENT' | 'AMOUNT';
  discountValue?: number;
}

interface CheckoutBody {
  items: CheckoutItem[];
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO';
  amountPaid?: number;
  customerId?: string; // ✅ Para ventas FIADO
  discountTotal?: number; // Descuento global (Módulo 14)
  couponCode?: string; // ✅ Cupón (Módulo 14.2-A)
}

interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
}

class CheckoutError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

async function executeCheckout(
  session: { storeId: string; userId: string },
  items: CheckoutItem[],
  shiftId: string | null, // ✅ Puede ser null para FIADO
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO',
  amountPaid?: number,
  customerId?: string, // ✅ Para FIADO
  discountTotal?: number, // Módulo 14: descuento global
  couponCode?: string // ✅ Módulo 14.2-A: cupón
): Promise<{ sale: any; saleItems: any[]; receivable?: any }> {
  return await prisma.$transaction(async (tx) => {
    // 1. Validar stock disponible y tipos
    const storeProducts = await tx.storeProduct.findMany({
      where: {
        id: { in: items.map((i) => i.storeProductId) },
        storeId: session.storeId,
        active: true,
      },
      include: { product: true },
    });

    if (storeProducts.length !== items.length) {
      throw new CheckoutError(
        'PRODUCT_NOT_FOUND',
        400,
        'Algunos productos no existen o están inactivos'
      );
    }

    // Validar stock y cantidades
    for (const item of items) {
      const sp = storeProducts.find((p) => p.id === item.storeProductId);
      if (!sp) {
        throw new CheckoutError(
          'PRODUCT_NOT_FOUND',
          400,
          `Producto ${item.storeProductId} no encontrado`
        );
      }

      // Validar cantidad según tipo
      if (sp.product.unitType === 'UNIT' && !Number.isInteger(item.quantity)) {
        throw new CheckoutError(
          'INVALID_QUANTITY',
          400,
          `${sp.product.name}: cantidad debe ser entera para productos tipo UNIT`,
          { productId: sp.id, productName: sp.product.name, quantity: item.quantity }
        );
      }

      if (item.quantity <= 0) {
        throw new CheckoutError(
          'INVALID_QUANTITY',
          400,
          `${sp.product.name}: cantidad debe ser mayor a 0`,
          { productId: sp.id, productName: sp.product.name, quantity: item.quantity }
        );
      }

      // Validar stock disponible
      if (sp.stock !== null) {
        const currentStock = sp.stock.toNumber();
        
        // No permitir ventas si el stock es negativo o cero
        if (currentStock <= 0) {
          throw new CheckoutError(
            'INSUFFICIENT_STOCK',
            409,
            `${sp.product.name}: sin stock disponible`,
            {
              productId: sp.id,
              productName: sp.product.name,
              requested: item.quantity,
              available: currentStock,
            }
          );
        }
        
        // Validar que hay suficiente stock para la cantidad solicitada
        if (currentStock < item.quantity) {
          throw new CheckoutError(
            'INSUFFICIENT_STOCK',
            409,
            `${sp.product.name}: stock insuficiente`,
            {
              productId: sp.id,
              productName: sp.product.name,
              requested: item.quantity,
              available: currentStock,
            }
          );
        }
      }
    }

    // 2. Obtener promociones activas de la tienda
    // ✅ MÓDULO 15: Feature Flag ENABLE_PROMOTIONS
    const enablePromotions = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_PROMOTIONS);
    
    const promotions = enablePromotions ? await tx.promotion.findMany({
      where: {
        storeId: session.storeId,
        active: true,
      },
    }) : [];

    // Convertir a formato usado por applyBestPromotion
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

    // 3. Validar y calcular descuentos por ítem (con promociones)
    // Orden: 1) Promo producto → 2) Promo categoría → 3) Volumen pack → 4) N-ésimo → 5) Descuento manual
    const itemsWithDiscounts = await Promise.all(items.map(async (item) => {
      const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
      const subtotalItem = item.quantity * item.unitPrice;
      
      // PASO 1: Aplicar promoción automática por PRODUCTO (si existe)
      const appliedPromo = applyBestPromotion(
        sp.product.id,
        item.quantity,
        item.unitPrice,
        subtotalItem,
        promoList
      );
      
      const promotionDiscount = appliedPromo?.promotionDiscount ?? 0;
      const subtotalAfterProductPromo = subtotalItem - promotionDiscount;
      
      // PASO 2: Aplicar promoción automática por CATEGORÍA (Módulo 14.2-B)
      // ✅ MÓDULO 15: Feature Flag ENABLE_CATEGORY_PROMOS
      const enableCategoryPromos = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_CATEGORY_PROMOS);
      
      const categoryPromoResult = enableCategoryPromos ? await computeCategoryPromoDiscount({
        storeId: session.storeId,
        productCategory: sp.product.category,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotalAfterProductPromo,
        nowLocalLima: new Date(),
      }) : null;
      
      const categoryPromoDiscount = categoryPromoResult?.discountAmount ?? 0;
      const categoryPromoName = categoryPromoResult?.promoSnapshot.name ?? null;
      const categoryPromoType = categoryPromoResult?.promoSnapshot.type ?? null;
      const subtotalAfterCategoryPromo = subtotalAfterProductPromo - categoryPromoDiscount;
      
      // PASO 3 & 4: REGLA ANTI-STACKING (PACK/VOLUMEN vs N-ÉSIMO)
      // ⚠️ Solo si NO hay promo de producto
      // Si hay ambas promos elegibles (volumen Y nth), aplicar SOLO la de MAYOR descuento
      let volumePromoDiscount = 0;
      let volumePromoName: string | null = null;
      let volumePromoQty: number | null = null;
      let nthPromoDiscount = 0;
      let nthPromoName: string | null = null;
      let nthPromoQty: number | null = null;
      let nthPromoPercent: number | null = null;
      
      if (promotionDiscount === 0) {
        // ✅ MÓDULO 15: Feature Flags para promociones de volumen y N-ésimo
        const enableVolumePromos = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_VOLUME_PROMOS);
        const enableNthPromos = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_NTH_PROMOS);
        
        // Calcular AMBAS promos candidatas (sin aplicar aún)
        const volumePromotion = enableVolumePromos ? await getActiveVolumePromotion(tx, session.storeId, sp.product.id) : null;
        const volumePromoResult = enableVolumePromos ? computeVolumePackDiscount({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotalAfterCategoryPromo,
          volumePromotion,
          unitType: sp.product.unitType,
        }) : null;
        
        const nthPromotion = enableNthPromos ? await getActiveNthPromotion(tx, session.storeId, sp.product.id) : null;
        const nthPromoResult = enableNthPromos ? computeNthPromoDiscount({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          baseAfterPreviousPromos: subtotalAfterCategoryPromo, // Evaluar sobre la misma base
          nthPromotion,
          unitType: sp.product.unitType,
        }) : null;
        
        const volumeDiscount = volumePromoResult?.discountAmount ?? 0;
        const nthDiscount = nthPromoResult?.discountAmount ?? 0;
        
        // REGLA: Aplicar SOLO la de MAYOR descuento (anti-stacking)
        if (volumeDiscount > 0 && nthDiscount > 0) {
          // Ambas elegibles → elegir la mayor
          if (volumeDiscount >= nthDiscount) {
            // PACK/VOLUMEN gana
            volumePromoDiscount = volumeDiscount;
            volumePromoName = volumePromoResult!.snapshot.volumePromoName;
            volumePromoQty = volumePromoResult!.snapshot.volumePromoQty;
            // Nth queda en 0 (suprimida)
          } else {
            // N-ÉSIMO gana
            nthPromoDiscount = nthDiscount;
            nthPromoName = nthPromoResult!.snapshot.nthPromoName;
            nthPromoQty = nthPromoResult!.snapshot.nthPromoQty;
            nthPromoPercent = nthPromoResult!.snapshot.nthPromoPercent ? Number(nthPromoResult!.snapshot.nthPromoPercent) : null;
            // Volumen queda en 0 (suprimida)
          }
        } else if (volumeDiscount > 0) {
          // Solo volumen elegible
          volumePromoDiscount = volumeDiscount;
          volumePromoName = volumePromoResult!.snapshot.volumePromoName;
          volumePromoQty = volumePromoResult!.snapshot.volumePromoQty;
        } else if (nthDiscount > 0) {
          // Solo nth elegible
          nthPromoDiscount = nthDiscount;
          nthPromoName = nthPromoResult!.snapshot.nthPromoName;
          nthPromoQty = nthPromoResult!.snapshot.nthPromoQty;
          nthPromoPercent = nthPromoResult!.snapshot.nthPromoPercent ? Number(nthPromoResult!.snapshot.nthPromoPercent) : null;
        }
      }
      
      const subtotalAfterAutoPromos = subtotalAfterCategoryPromo - volumePromoDiscount - nthPromoDiscount;
      
      // PASO 5: Aplicar descuento manual (si existe)
      let discountAmount = 0;
      
      if (item.discountType && item.discountValue !== undefined) {
        // Validar discountValue presente
        if (item.discountValue === null || item.discountValue === undefined) {
          throw new CheckoutError(
            'DISCOUNT_VALUE_REQUIRED',
            400,
            `${sp.product.name}: discountValue es requerido cuando se especifica discountType`
          );
        }

        // Calcular según tipo
        if (item.discountType === 'PERCENT') {
          if (item.discountValue <= 0 || item.discountValue > 100) {
            throw new CheckoutError(
              'INVALID_DISCOUNT_PERCENT',
              400,
              `${sp.product.name}: descuento porcentual debe estar entre 1 y 100`
            );
          }
          discountAmount = Math.round((subtotalAfterAutoPromos * item.discountValue) / 100 * 100) / 100;
        } else if (item.discountType === 'AMOUNT') {
          if (item.discountValue <= 0 || item.discountValue > subtotalAfterAutoPromos) {
            throw new CheckoutError(
              'DISCOUNT_EXCEEDS_SUBTOTAL',
              409,
              `${sp.product.name}: el descuento no puede ser mayor al subtotal después de promociones (S/ ${subtotalAfterAutoPromos.toFixed(2)})`
            );
          }
          discountAmount = item.discountValue;
        }

        // Clamp: nunca negativo, nunca mayor al subtotal restante
        discountAmount = Math.max(0, Math.min(discountAmount, subtotalAfterAutoPromos));
      }

      // PASO 6: Calcular totalLine = subtotal - promo producto - promo categoría - promo volumen - nth promo - descuento manual
      const totalLine = subtotalItem - promotionDiscount - categoryPromoDiscount - volumePromoDiscount - nthPromoDiscount - discountAmount;

      return {
        ...item,
        productId: sp.product.id,
        subtotalItem,
        promotionType: appliedPromo?.promotionType ?? null,
        promotionName: appliedPromo?.promotionName ?? null,
        promotionDiscount,
        categoryPromoName,
        categoryPromoType,
        categoryPromoDiscount,
        volumePromoName,
        volumePromoQty,
        volumePromoDiscount,
        nthPromoName,
        nthPromoQty,
        nthPromoPercent,
        nthPromoDiscount,
        discountAmount,
        totalLine,
      };
    }));

    // 4. Calcular totales
    const subtotalBeforeDiscounts = itemsWithDiscounts.reduce((sum, item) => sum + item.subtotalItem, 0);
    const promotionsTotal = itemsWithDiscounts.reduce((sum, item) => sum + item.promotionDiscount, 0);
    const categoryPromosTotal = itemsWithDiscounts.reduce((sum, item) => sum + item.categoryPromoDiscount, 0);
    const volumePromosTotal = itemsWithDiscounts.reduce((sum, item) => sum + item.volumePromoDiscount, 0); // ✅ Módulo 14.2-C1
    const nthPromosTotal = itemsWithDiscounts.reduce((sum, item) => sum + item.nthPromoDiscount, 0); // ✅ Módulo 14.2-C2
    const itemDiscountsTotal = itemsWithDiscounts.reduce((sum, item) => sum + item.discountAmount, 0);
    const subtotalAfterItemDiscounts = subtotalBeforeDiscounts - promotionsTotal - categoryPromosTotal - volumePromosTotal - nthPromosTotal - itemDiscountsTotal;
    
    // Tax (usando lógica actual, puede ser 0)
    const tax = 0;
    
    const totalBeforeGlobalDiscount = subtotalAfterItemDiscounts + tax;
    
    // ✅ 4.5. CUPÓN (Módulo 14.2-A)
    // IMPORTANTE: El cupón se valida ANTES del descuento global
    // para evitar que el descuento global invalide un cupón ya aplicado
    let couponDiscount = 0;
    let couponSnapshot: {
      couponCode: string;
      couponType: string;
      couponValue: number;
    } | null = null;

    if (couponCode) {
      // ✅ MÓDULO 15: Feature Flag ALLOW_COUPONS
      await requireFeature(session.storeId, FeatureFlagKey.ALLOW_COUPONS);
      
      const normalizedCouponCode = normalizeCouponCode(couponCode);

      if (!normalizedCouponCode) {
        throw new CheckoutError(
          'INVALID_COUPON_CODE_FORMAT',
          400,
          'El código del cupón es inválido'
        );
      }

      // Buscar cupón (con lock para evitar race conditions en usesCount)
      const couponData = await tx.coupon.findUnique({
        where: {
          storeId_code: {
            storeId: session.storeId,
            code: normalizedCouponCode,
          },
        },
      });

      // Convertir a formato de interfaz Coupon
      const coupon = couponData ? {
        id: couponData.id,
        storeId: couponData.storeId,
        code: couponData.code,
        type: couponData.type,
        value: Number(couponData.value),
        minTotal: couponData.minTotal ? Number(couponData.minTotal) : null,
        startsAt: couponData.startsAt,
        endsAt: couponData.endsAt,
        maxUses: couponData.maxUses,
        usesCount: couponData.usesCount,
        active: couponData.active,
      } : null;

      // Hora actual Lima (UTC-5)
      const nowLocalLima = new Date(Date.now() - 5 * 60 * 60 * 1000);

      // Validar y calcular descuento sobre el total ANTES del descuento global
      try {
        const result = validateAndComputeCouponDiscount(
          coupon,
          totalBeforeGlobalDiscount, // ✅ Validar sobre total ANTES de descuento global
          nowLocalLima
        );

        couponDiscount = result.discountAmount;
        couponSnapshot = result.snapshotFields;

        // Incrementar usesCount (dentro de transacción)
        await tx.coupon.update({
          where: { id: coupon!.id },
          data: { usesCount: { increment: 1 } },
        });

        // Validar nuevamente que no excedió maxUses después del incremento
        if (coupon!.maxUses !== null) {
          const updatedCoupon = await tx.coupon.findUnique({
            where: { id: coupon!.id },
            select: { usesCount: true, maxUses: true },
          });

          if (updatedCoupon && updatedCoupon.usesCount > updatedCoupon.maxUses!) {
            throw new CheckoutError(
              'COUPON_MAX_USES_REACHED',
              409,
              'El cupón ha alcanzado su límite de usos',
              {
                maxUses: updatedCoupon.maxUses,
                usesCount: updatedCoupon.usesCount,
              }
            );
          }
        }
      } catch (error) {
        const couponError = error as CouponError | CheckoutError;
        if (couponError instanceof CheckoutError) {
          throw couponError;
        }
        throw new CheckoutError(
          couponError.code,
          409,
          couponError.message,
          couponError.details
        );
      }
    }

    // 4.6. Validar y aplicar descuento global (DESPUÉS de cupón)
    const globalDiscount = discountTotal ?? 0;
    if (globalDiscount < 0) {
      throw new CheckoutError(
        'INVALID_DISCOUNT',
        400,
        'El descuento global no puede ser negativo'
      );
    }
    
    // El descuento global se aplica sobre el subtotal después de cupón
    const totalAfterCoupon = totalBeforeGlobalDiscount - couponDiscount;
    
    if (globalDiscount > totalAfterCoupon) {
      throw new CheckoutError(
        'DISCOUNT_EXCEEDS_TOTAL',
        409,
        `El descuento global no puede ser mayor al total (S/ ${totalAfterCoupon.toFixed(2)})`
      );
    }
    
    // Total de descuentos (ítems + global) para guardar en discountTotal
    const totalDiscounts = itemDiscountsTotal + globalDiscount;

    // Total FINAL (después de cupón y descuento global)
    const total = totalAfterCoupon - globalDiscount;

    // ✅ MÓDULO 15 - FASE 3: VALIDAR LÍMITES OPERATIVOS
    // Las validaciones se hacen ANTES de ejecutar la transacción
    
    // 1) Validar cantidad de ítems
    await validateItemsCount(session.storeId, items.length);
    
    // 2) Validar descuentos manuales porcentuales
    for (const item of items) {
      if (item.discountType === 'PERCENT' && item.discountValue) {
        await validateDiscountPercent(session.storeId, item.discountValue);
      }
    }
    
    // 3) Validar montos de descuentos manuales
    const totalManualDiscounts = itemDiscountsTotal + globalDiscount;
    if (totalManualDiscounts > 0) {
      await validateManualDiscountAmount(session.storeId, totalManualDiscounts);
    }
    
    // 4) Validar total de la venta
    await validateSaleTotal(session.storeId, total);
    
    // 5) Validar balance de cuentas por cobrar (solo para FIADO)
    if (paymentMethod === 'FIADO' && customerId) {
      await validateReceivableBalance(session.storeId, customerId, total);
    }

    // 5. Validar y calcular changeAmount si es efectivo
    let changeAmount: number | null = null;
    if (paymentMethod === 'CASH' && amountPaid !== undefined) {
      // ✅ Validar que el monto pagado es suficiente
      // Redondear ambos valores a 2 decimales para evitar problemas de precisión
      const totalRounded = Math.round(total * 100) / 100;
      const amountPaidRounded = Math.round(amountPaid * 100) / 100;
      
      // 🔍 DEBUG: Log de valores para debug
      console.log('💰 CASH Payment Validation:', {
        totalBeforeGlobalDiscount: totalBeforeGlobalDiscount.toFixed(2),
        couponDiscount: couponDiscount.toFixed(2),
        totalAfterCoupon: totalAfterCoupon.toFixed(2),
        globalDiscount: globalDiscount.toFixed(2),
        totalCalculated: total.toFixed(4),
        totalRounded: totalRounded.toFixed(2),
        amountPaid: amountPaid.toFixed(2),
        amountPaidRounded: amountPaidRounded.toFixed(2),
        difference: (totalRounded - amountPaidRounded).toFixed(4),
        isInsufficient: amountPaidRounded < totalRounded,
      });
      
      if (amountPaidRounded < totalRounded) {
        throw new CheckoutError(
          'AMOUNT_INSUFFICIENT',
          409,
          'El monto pagado es menor al total de la venta',
          { 
            total: totalRounded.toFixed(2), 
            amountPaid: amountPaidRounded.toFixed(2), 
            missing: (totalRounded - amountPaidRounded).toFixed(2) 
          }
        );
      }
      changeAmount = amountPaidRounded - totalRounded;
    }

    // 3b. Para FIADO: amountPaid y changeAmount deben ser null
    if (paymentMethod === 'FIADO') {
      // ✅ MÓDULO 15: Feature Flag ALLOW_FIADO
      await requireFeature(session.storeId, FeatureFlagKey.ALLOW_FIADO);
      
      if (!customerId) {
        throw new CheckoutError('CUSTOMER_REQUIRED', 400, 'Debes seleccionar un cliente para ventas FIADO');
      }
      // Verificar que el cliente existe y pertenece a la tienda
      const customer = await tx.customer.findFirst({
        where: { id: customerId, storeId: session.storeId, active: true },
      });
      if (!customer) {
        throw new CheckoutError('CUSTOMER_NOT_FOUND', 404, 'Cliente no encontrado o inactivo');
      }
    }

    // 4. Obtener el siguiente número de venta
    const lastSale = await tx.sale.findFirst({
      where: { storeId: session.storeId },
      orderBy: { saleNumber: 'desc' },
      select: { saleNumber: true },
    });

    const nextSaleNumber = (lastSale?.saleNumber ?? 0) + 1;

    // 5. Crear Sale con descuentos y cupón
    const saleData: any = {
      storeId: session.storeId,
      userId: session.userId,
      saleNumber: nextSaleNumber,
      subtotal: new Prisma.Decimal(subtotalBeforeDiscounts),
      tax: new Prisma.Decimal(tax),
      discountTotal: new Prisma.Decimal(totalDiscounts),
      totalBeforeDiscount: new Prisma.Decimal(totalBeforeGlobalDiscount),
      // ✅ Cupón (Módulo 14.2-A)
      totalBeforeCoupon: new Prisma.Decimal(totalBeforeGlobalDiscount),
      couponCode: couponSnapshot?.couponCode ?? null,
      couponType: couponSnapshot?.couponType ?? null,
      couponValue: couponSnapshot?.couponValue ? new Prisma.Decimal(couponSnapshot.couponValue) : null,
      couponDiscount: new Prisma.Decimal(couponDiscount),
      total: new Prisma.Decimal(total),
      paymentMethod: paymentMethod,
    };

    // Para FIADO: shiftId es null, amountPaid y changeAmount null, agregar customerId
    if (paymentMethod === 'FIADO') {
      saleData.shiftId = null;
      saleData.amountPaid = null;
      saleData.changeAmount = null;
      saleData.customerId = customerId;
    } else {
      // Para otros métodos: shiftId requerido
      saleData.shiftId = shiftId;
      saleData.amountPaid = amountPaid !== undefined ? new Prisma.Decimal(amountPaid) : null;
      saleData.changeAmount = changeAmount !== null ? new Prisma.Decimal(changeAmount) : null;
    }

    const sale = await tx.sale.create({ data: saleData });

    // 6. Crear SaleItems con snapshot y descuentos
    const saleItems = await Promise.all(
      itemsWithDiscounts.map((item) => {
        const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
        return tx.saleItem.create({
          data: {
            saleId: sale.id,
            storeProductId: item.storeProductId,
            productName: sp.product.name,
            productContent: sp.product.content,
            unitType: sp.product.unitType,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            subtotal: new Prisma.Decimal(item.subtotalItem),
            // Promociones por producto (Módulo 14.1)
            promotionType: item.promotionType,
            promotionName: item.promotionName,
            promotionDiscount: new Prisma.Decimal(item.promotionDiscount),
            // Promociones por categoría (Módulo 14.2-B)
            categoryPromoName: item.categoryPromoName,
            categoryPromoType: item.categoryPromoType,
            categoryPromoDiscount: new Prisma.Decimal(item.categoryPromoDiscount),
            // Promociones por volumen (Módulo 14.2-C1)
            volumePromoName: item.volumePromoName,
            volumePromoQty: item.volumePromoQty,
            volumePromoDiscount: new Prisma.Decimal(item.volumePromoDiscount),
            // Promociones n-ésimo (Módulo 14.2-C2)
            nthPromoName: item.nthPromoName,
            nthPromoQty: item.nthPromoQty,
            nthPromoPercent: item.nthPromoPercent !== null ? new Prisma.Decimal(item.nthPromoPercent) : null,
            nthPromoDiscount: new Prisma.Decimal(item.nthPromoDiscount),
            // Descuentos manuales (Módulo 14)
            discountType: item.discountType ?? null,
            discountValue: item.discountValue !== undefined ? new Prisma.Decimal(item.discountValue) : null,
            discountAmount: new Prisma.Decimal(item.discountAmount),
            totalLine: new Prisma.Decimal(item.totalLine),
          },
        });
      })
    );

    // 7. Crear Movements (sin cambios - usa subtotal original)
    await Promise.all(
      itemsWithDiscounts.map((item) => {
        return tx.movement.create({
          data: {
            storeId: session.storeId,
            storeProductId: item.storeProductId,
            type: 'SALE',
            quantity: new Prisma.Decimal(-item.quantity), // Negativo = salida
            unitPrice: new Prisma.Decimal(item.unitPrice),
            total: new Prisma.Decimal(item.subtotalItem), // Usa subtotal sin descuento para movements
            notes: `Venta #${nextSaleNumber}`,
            createdById: session.userId,
          },
        });
      })
    );

    // 8. Actualizar stock
    await Promise.all(
      itemsWithDiscounts.map((item) => {
        const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
        const currentStock = sp.stock ? sp.stock.toNumber() : 0;
        const newStock = currentStock - item.quantity;

        return tx.storeProduct.update({
          where: { id: item.storeProductId },
          data: { stock: new Prisma.Decimal(newStock) },
        });
      })
    );

    // 9. Si es FIADO, crear Receivable
    let receivable = null;
    if (paymentMethod === 'FIADO') {
      receivable = await tx.receivable.create({
        data: {
          storeId: session.storeId,
          customerId: customerId!,
          saleId: sale.id,
          originalAmount: new Prisma.Decimal(total),
          balance: new Prisma.Decimal(total),
          status: 'OPEN',
          createdById: session.userId,
        },
      });
    }

    return { sale, saleItems, receivable };
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let lockAcquired = false;
  
  try {
    const session = await getSession();
    if (!session) {
      const error: ErrorResponse = {
        code: 'UNAUTHORIZED',
        message: 'No autenticado',
      };
      return NextResponse.json(error, { status: 401 });
    }

    // ✅ MÓDULO 16.1: Rate Limiting
    const rateLimitResult = checkRateLimit('checkout', session.userId);
    if (!rateLimitResult.allowed) {
      // Auditoría de rate limit
      const { ip, userAgent } = getRequestMetadata(req);
      logAudit({
        storeId: session.storeId,
        userId: session.userId,
        action: 'RATE_LIMIT_EXCEEDED',
        entityType: 'SALE',
        severity: 'WARN',
        meta: {
          endpoint: 'checkout',
          resetAt: new Date(rateLimitResult.resetAt).toISOString(),
        },
        ip,
        userAgent,
      }).catch(() => {});

      const error: ErrorResponse = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.',
        details: {
          resetAt: new Date(rateLimitResult.resetAt).toISOString(),
        },
      };
      return NextResponse.json(error, { status: 429 });
    }

    // ✅ MÓDULO 16.1: Idempotency - Verificar si es un replay
    const idempotencyKey = req.headers.get('idempotency-key');
    if (idempotencyKey) {
      const cachedResult = getIdempotentResult(idempotencyKey);
      if (cachedResult) {
        // Replay detectado - devolver resultado anterior
        const { ip, userAgent } = getRequestMetadata(req);
        logAudit({
          storeId: session.storeId,
          userId: session.userId,
          action: 'CHECKOUT_REPLAY',
          entityType: 'SALE',
          entityId: cachedResult.saleId,
          severity: 'INFO',
          meta: {
            idempotencyKey,
            saleNumber: cachedResult.saleNumber,
          },
          ip,
          userAgent,
        }).catch(() => {});

        return NextResponse.json({
          ...cachedResult,
          code: 'IDEMPOTENT_REPLAY',
        }, { status: 200 });
      }
    }

    // ✅ MÓDULO 16.1: Lock de checkout - Evitar checkouts simultáneos
    lockAcquired = acquireCheckoutLock(session.storeId, session.userId);
    if (!lockAcquired) {
      // Auditoría de lock
      const { ip, userAgent } = getRequestMetadata(req);
      logAudit({
        storeId: session.storeId,
        userId: session.userId,
        action: 'CHECKOUT_LOCKED',
        entityType: 'SALE',
        severity: 'WARN',
        meta: {
          reason: 'Checkout already in progress',
        },
        ip,
        userAgent,
      }).catch(() => {});

      const error: ErrorResponse = {
        code: 'CHECKOUT_IN_PROGRESS',
        message: 'Ya tienes una venta en proceso. Espera a que termine.',
      };
      return NextResponse.json(error, { status: 409 });
    }

    // ✅ MÓDULO 16.1: Validaciones defensivas extra
    // Verificar que la tienda está activa
    const store = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { status: true },
    });

    if (!store || store.status !== 'ACTIVE') {
      const error: ErrorResponse = {
        code: 'STORE_INACTIVE',
        message: 'La tienda no está activa',
      };
      return NextResponse.json(error, { status: 403 });
    }

    // Verificar que el usuario está activo
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { active: true },
    });

    if (!user || !user.active) {
      const error: ErrorResponse = {
        code: 'USER_INACTIVE',
        message: 'El usuario no está activo',
      };
      return NextResponse.json(error, { status: 403 });
    }

    // Verificar que el usuario puede vender (OWNER o CASHIER)
    if (session.role !== 'OWNER' && session.role !== 'CASHIER') {
      const error: ErrorResponse = {
        code: 'FORBIDDEN',
        message: 'No tienes permisos para realizar ventas',
        details: { requiredRoles: ['OWNER', 'CASHIER'] },
      };
      return NextResponse.json(error, { status: 403 });
    }

    const body: CheckoutBody = await req.json();
    const { items, paymentMethod, amountPaid, customerId, discountTotal, couponCode } = body;

    // Validaciones básicas
    if (!items || items.length === 0) {
      const error: ErrorResponse = {
        code: 'EMPTY_CART',
        message: 'El carrito está vacío',
      };
      return NextResponse.json(error, { status: 400 });
    }

    // Validar paymentMethod
    if (!paymentMethod || !['CASH', 'YAPE', 'PLIN', 'CARD', 'FIADO'].includes(paymentMethod)) {
      const error: ErrorResponse = {
        code: 'INVALID_PAYMENT_METHOD',
        message: 'Método de pago inválido',
        details: { allowedMethods: ['CASH', 'YAPE', 'PLIN', 'CARD', 'FIADO'] },
      };
      return NextResponse.json(error, { status: 400 });
    }

    // Validar amountPaid según método de pago
    if (paymentMethod === 'CASH') {
      if (amountPaid === undefined || amountPaid === null || typeof amountPaid !== 'number') {
        const error: ErrorResponse = {
          code: 'AMOUNT_REQUIRED',
          message: 'Para pagos en efectivo debes especificar el monto pagado',
        };
        return NextResponse.json(error, { status: 400 });
      }

      // ✅ VALIDACIÓN COMPLETA SE HACE EN executeCheckout() después de calcular:
      // - Promociones de producto (2x1, pack, happy hour)
      // - Promociones de categoría (Módulo 14.2-B)
      // - Descuentos manuales por ítem
      // - Descuento global
      // - Cupones (Módulo 14.2-A)
      // No validamos amountPaid aquí para evitar errores 409 por cálculos incompletos
    } else if (paymentMethod === 'FIADO') {
      // Para FIADO, validar customerId
      if (!customerId || typeof customerId !== 'string') {
        const error: ErrorResponse = {
          code: 'CUSTOMER_REQUIRED',
          message: 'Debes seleccionar un cliente para ventas FIADO',
        };
        return NextResponse.json(error, { status: 400 });
      }
      // amountPaid debe ser undefined o null
      if (amountPaid !== undefined && amountPaid !== null) {
        const error: ErrorResponse = {
          code: 'PAYMENT_NOT_ALLOWED',
          message: 'No se puede especificar monto pagado para ventas FIADO',
        };
        return NextResponse.json(error, { status: 400 });
      }
    } else {
      // Para otros métodos, amountPaid debe ser undefined o null
      if (amountPaid !== undefined && amountPaid !== null) {
        const error: ErrorResponse = {
          code: 'PAYMENT_NOT_ALLOWED',
          message: 'No se puede especificar monto pagado para este método de pago',
          details: { paymentMethod },
        };
        return NextResponse.json(error, { status: 403 });
      }
    }

    // Validar formato de items
    for (const item of items) {
      if (!item.storeProductId || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
        const error: ErrorResponse = {
          code: 'INVALID_ITEM_FORMAT',
          message: 'Formato de item inválido',
          details: { requiredFields: ['storeProductId', 'quantity', 'unitPrice'] },
        };
        return NextResponse.json(error, { status: 400 });
      }
    }

    // VALIDACIÓN CRÍTICA: Verificar que hay turno abierto (excepto para FIADO)
    let currentShift = null;
    if (paymentMethod !== 'FIADO') {
      currentShift = await shiftRepo.getCurrentShift(session.storeId, session.userId);

      if (!currentShift) {
        const error: ErrorResponse = {
          code: 'SHIFT_REQUIRED',
          message: 'Debes abrir un turno antes de realizar ventas',
        };
        return NextResponse.json(error, { status: 409 });
      }
    }

    // ✅ MÓDULO 16.1: Timeout protection - Verificar si ya pasó demasiado tiempo
    const elapsed = Date.now() - startTime;
    if (elapsed > 3000) {
      // Auditoría de timeout
      const { ip, userAgent } = getRequestMetadata(req);
      logAudit({
        storeId: session.storeId,
        userId: session.userId,
        action: 'CHECKOUT_TIMEOUT',
        entityType: 'SALE',
        severity: 'ERROR',
        meta: {
          elapsedMs: elapsed,
        },
        ip,
        userAgent,
      }).catch(() => {});

      const error: ErrorResponse = {
        code: 'CHECKOUT_TIMEOUT',
        message: 'La operación tardó demasiado. Intenta nuevamente.',
      };
      return NextResponse.json(error, { status: 500 });
    }

    // Ejecutar checkout con reintentos en caso de colisión de saleNumber
    const MAX_RETRIES = 3;
    let result;
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        result = await executeCheckout(
          session,
          items,
          currentShift?.id || null,
          paymentMethod,
          amountPaid,
          customerId,
          discountTotal,
          couponCode
        );
        break; // Éxito, salir del bucle
      } catch (error: any) {
        lastError = error;
        
        // Detectar colisión de saleNumber (unique constraint)
        // El target viene como array: ['store_id', 'sale_number']
        const isSaleNumberCollision =
          error.code === 'P2002' &&
          error.meta?.target?.includes('sale_number');

        if (isSaleNumberCollision && attempt < MAX_RETRIES - 1) {
          // Esperar un tiempo aleatorio antes de reintentar (entre 50-150ms)
          // Esto permite que la transacción concurrente termine
          const delay = 50 + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Reintentar
        }
        
        // Cualquier otro error o se agotaron los reintentos
        throw lastError;
      }
    }

    // Verificar que result no sea undefined
    if (!result) {
      throw new Error('Checkout failed after retries');
    }

    // ✅ MÓDULO 16.1: Guardar resultado para idempotency
    if (idempotencyKey) {
      const idempotentResult = {
        success: true,
        saleId: result.sale.id,
        saleNumber: result.sale.saleNumber,
        total: result.sale.total.toNumber(),
        itemCount: result.saleItems.length,
      };
      saveIdempotentResult(idempotencyKey, idempotentResult);
    }

    // ✅ MÓDULO 16.1: Liberar lock
    releaseCheckoutLock(session.storeId, session.userId);
    lockAcquired = false;

    // ✅ MÓDULO 15: Auditoría de checkout exitoso (fire-and-forget)
    const { ip, userAgent } = getRequestMetadata(req);
    logAudit({
      storeId: session.storeId,
      userId: session.userId,
      action: 'SALE_CHECKOUT_SUCCESS',
      entityType: 'SALE',
      entityId: result.sale.id,
      severity: 'INFO',
      meta: {
        saleNumber: result.sale.saleNumber,
        total: result.sale.total.toNumber(),
        paymentMethod: result.sale.paymentMethod,
        hasPromotion: result.saleItems.some(i => i.promotionDiscount > 0),
        hasCoupon: !!result.sale.couponCode,
      },
      ip,
      userAgent,
    }).catch(err => {
      // Silently fail - no afectar la respuesta
      console.error('[AuditLog] Failed to log SALE_CHECKOUT_SUCCESS:', err);
    });

    // ✅ MÓDULO 15: Si es FIADO, log adicional de receivable creado (fire-and-forget)
    if (result.receivable) {
      logAudit({
        storeId: session.storeId,
        userId: session.userId,
        action: 'RECEIVABLE_CREATED',
        entityType: 'RECEIVABLE',
        entityId: result.receivable.id,
        severity: 'INFO',
        meta: {
          saleNumber: result.sale.saleNumber,
          customerId: result.receivable.customerId,
          amount: result.receivable.originalAmount.toNumber(),
          balance: result.receivable.balance.toNumber(),
        },
        ip,
        userAgent,
      }).catch(err => {
        console.error('[AuditLog] Failed to log RECEIVABLE_CREATED:', err);
      });
    }

    return NextResponse.json(
      {
        success: true,
        saleId: result.sale.id,
        saleNumber: result.sale.saleNumber,
        total: result.sale.total.toNumber(),
        itemCount: result.saleItems.length,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Checkout error:', error);

    // ✅ MÓDULO 16.1: Liberar lock en caso de error
    if (lockAcquired) {
      try {
        const sessionData = await getSession();
        if (sessionData) {
          releaseCheckoutLock(sessionData.storeId, sessionData.userId);
        }
      } catch {
        // Ignorar error al liberar lock
      }
    }

    // ✅ MÓDULO 15: Auditoría de checkout fallido (fire-and-forget)
    try {
      const { ip, userAgent } = getRequestMetadata(req);
      const sessionData = await getSession();
      const errorStage = error instanceof CheckoutError ? 'validation' : 
                         error.code === 'P2002' ? 'transaction' : 'unknown';
      
      logAudit({
        storeId: sessionData?.storeId,
        userId: sessionData?.userId,
        action: 'SALE_CHECKOUT_FAILED',
        entityType: 'SALE',
        entityId: null,
        severity: 'ERROR',
        meta: {
          errorCode: error.code || error.name || 'UNKNOWN',
          message: error.message,
          stage: errorStage,
        },
        ip,
        userAgent,
      }).catch(auditErr => {
        console.error('[AuditLog] Failed to log SALE_CHECKOUT_FAILED:', auditErr);
      });
    } catch {}

    // Errores personalizados
    if (error instanceof CheckoutError) {
      const errorResponse: ErrorResponse = {
        code: error.code,
        message: error.message,
        details: error.details,
      };
      return NextResponse.json(errorResponse, { status: error.statusCode });
    }
    // ✅ MÓDULO 15 - FASE 3: Error de límites operativos
    if (error instanceof LimitExceededError) {
      const errorResponse: ErrorResponse = {
        code: error.code,
        message: error.message,
        details: error.details,
      };
      return NextResponse.json(errorResponse, { status: error.statusCode });
    }
    // ✅ MÓDULO 15: Errores de Feature Flags
    if (error instanceof FeatureDisabledError) {
      const errorResponse: ErrorResponse = {
        code: error.code,
        message: error.message,
        details: { flagKey: error.flagKey },
      };
      return NextResponse.json(errorResponse, { status: error.statusCode });
    }

    // Errores de Prisma P2002 - Si llegó aquí, el retry interno falló
    if (error.code === 'P2002') {
      const errorResponse: ErrorResponse = {
        code: 'CONSTRAINT_VIOLATION',
        message: 'Violación de restricción única',
        details: error.meta,
      };
      return NextResponse.json(errorResponse, { status: 409 });
    }

    // Error genérico
    const errorResponse: ErrorResponse = {
      code: 'INTERNAL_ERROR',
      message: 'Error interno al procesar la venta',
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
