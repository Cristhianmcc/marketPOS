import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStoreUser } from '@/lib/session';
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
import { acquireCheckoutLock, releaseCheckoutLock } from '@/lib/checkoutLock'; // ✅ MÓDULO 16.1: Checkout Lock
import { normalizeToBaseUnit } from '@/lib/units'; // ✅ MÓDULO V2: Conversiones de unidades
import { computeLineTaxes } from '@/lib/sales/lineTaxes';
import { PharmacyTraceError, registerPharmacyTrace } from '@/lib/sales/pharmacyTrace';
import { consumeSaleInventory, InventoryMutationError } from '@/lib/inventory/stockMutations';
import {
  createCheckoutSaleId,
  createCheckoutRequestHash,
  getCheckoutRequestHash,
  parseCheckoutIdempotencyKey,
} from '@/lib/sales/checkoutIdempotency';

const shiftRepo = new PrismaShiftRepository();

interface CheckoutItem {
  storeProductId?: string; // ✅ F3: Opcional para servicios
  quantity: number;
  unitPrice: number;
  // Descuentos (Módulo 14)
  discountType?: 'PERCENT' | 'AMOUNT';
  discountValue?: number;
  // ✅ MÓDULO V2: Conversiones de unidades (opcional)
  saleUnitId?: string; // ID de la unidad usada en la venta (si diferente a base)
  // ✅ MÓDULO F3: Servicios
  isService?: boolean;
  serviceId?: string;
  serviceName?: string; // Para snapshot
  // Venta libre (producto no registrado en inventario)
  isFreeItem?: boolean;
  productName?: string; // Nombre del producto libre
  // ✅ MÓDULO PH5: Receta médica (solo si requiresPrescription)
  rxPatientName?: string;
  rxPrescriptionNumber?: string;
  rxObservation?: string;
}

interface PaymentSplit {
  method: 'CASH' | 'YAPE' | 'PLIN' | 'CARD';
  amount: number;
}

interface CheckoutBody {
  items: CheckoutItem[];
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO' | 'MIXED';
  amountPaid?: number;
  customerId?: string; // ✅ Para ventas FIADO
  discountTotal?: number; // Descuento global (Módulo 14)
  couponCode?: string; // ✅ Cupón (Módulo 14.2-A)
  patientId?: string; // ✅ Paciente para historial de medicamentos y libro de controlados
  prescribedBy?: string; // ✅ Médico que prescribe (para libro de controlados)
  cmpNumber?: string; // ✅ Número CMP del médico
  consultReason?: string; // ✅ Motivo de consulta / dispensación
  // ✅ Pago Mixto: desglose de pagos
  paymentSplits?: PaymentSplit[];
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

async function findPersistedCheckout(storeId: string, userId: string, saleId: string) {
  return prisma.sale.findFirst({
    where: { id: saleId, storeId, userId },
    select: {
      id: true,
      saleNumber: true,
      total: true,
      paymentDetails: true,
      _count: { select: { items: true } },
    },
  });
}

function persistedCheckoutPayload(
  sale: { id: string; saleNumber: number; total: Prisma.Decimal; _count: { items: number } },
  replay = false
) {
  return {
    success: true,
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    total: sale.total.toNumber(),
    itemCount: sale._count.items,
    ...(replay ? { code: 'IDEMPOTENT_REPLAY' } : {}),
  };
}

async function executeCheckout(
  session: { storeId: string; userId: string },
  items: CheckoutItem[],
  shiftId: string | null, // ✅ Puede ser null para FIADO
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO' | 'MIXED',
  checkoutSaleId: string,
  checkoutHash: string,
  amountPaid?: number,
  customerId?: string, // ✅ Para FIADO
  discountTotal?: number, // Módulo 14: descuento global
  couponCode?: string, // ✅ Módulo 14.2-A: cupón
  paymentSplits?: PaymentSplit[], // ✅ Pago Mixto: desglose
  patientId?: string,
  prescribedBy?: string,
  cmpNumber?: string,
  consultReason?: string
): Promise<{ sale: any; saleItems: any[]; receivable?: any }> {
  return await prisma.$transaction(async (tx) => {
    // 1. Verificar si la tienda está en Demo Mode
    const store = await tx.store.findUnique({
      where: { id: session.storeId },
      select: { isDemoStore: true }
    });
    const isDemoMode = store?.isDemoStore ?? false;

    // ✅ MÓDULO F3: Separar items de productos, servicios y ventas libres
    const productItems = items.filter(i => !i.isService && !i.isFreeItem && i.storeProductId);
    const serviceItems = items.filter(i => i.isService && i.serviceId);
    const freeItems = items.filter(i => i.isFreeItem && i.productName);

    // ✅ F3: Validar servicios existen y están activos
    let validatedServices: Array<{ id: string; name: string; price: any; taxable: boolean }> = [];
    if (serviceItems.length > 0) {
      const serviceIds = serviceItems.map(i => i.serviceId!);
      validatedServices = await tx.service.findMany({
        where: {
          id: { in: serviceIds },
          storeId: session.storeId,
          active: true,
        },
        select: { id: true, name: true, price: true, taxable: true },
      });

      if (validatedServices.length !== serviceItems.length) {
        throw new CheckoutError(
          'SERVICE_NOT_FOUND',
          400,
          'Algunos servicios no existen o están inactivos'
        );
      }
    }

    // 2. Validar stock disponible y tipos (solo productos)
    const storeProducts = await tx.storeProduct.findMany({
      where: {
        id: { in: productItems.map((i) => i.storeProductId!) },
        storeId: session.storeId,
        active: true,
      },
      include: {
        product: {
          include: {
            baseUnit: true, // ✅ SUNAT: Para snapshot unitSunatCode
          },
        },
      },
    });

    if (storeProducts.length !== productItems.length) {
      throw new CheckoutError(
        'PRODUCT_NOT_FOUND',
        400,
        'Algunos productos no existen o están inactivos'
      );
    }

    // Unidades de venta distintas de la base (caja, rollo, centímetro...).
    const saleUnitIds = [...new Set(productItems.flatMap((i) => (i.saleUnitId ? [i.saleUnitId] : [])))];
    const saleUnits = saleUnitIds.length > 0
      ? await tx.unit.findMany({ where: { id: { in: saleUnitIds } }, select: { id: true, allowDecimals: true, sunatCode: true } })
      : [];

    // Validar stock y cantidades (solo productos)
    for (const item of productItems) {
      const sp = storeProducts.find((p) => p.id === item.storeProductId);
      if (!sp) {
        throw new CheckoutError(
          'PRODUCT_NOT_FOUND',
          400,
          `Producto ${item.storeProductId} no encontrado`
        );
      }

      // La cantidad viene en la unidad elegida: se valida contra esa unidad.
      // Así una caja o un rollo no se fraccionan aunque el metro admita decimales.
      const usesSaleUnit = !!item.saleUnitId && item.saleUnitId !== sp.product.baseUnitId;
      const saleUnit = usesSaleUnit ? saleUnits.find((u) => u.id === item.saleUnitId) : null;
      if (usesSaleUnit && !saleUnit) {
        throw new CheckoutError(
          'INVALID_SALE_UNIT',
          400,
          `${sp.product.name}: la unidad de venta no existe`,
          { productId: sp.id, productName: sp.product.name }
        );
      }
      const unitAllowsDecimals = saleUnit
        ? saleUnit.allowDecimals
        : (sp.product.baseUnit?.allowDecimals ?? false);
      if (!unitAllowsDecimals && !Number.isInteger(item.quantity)) {
        throw new CheckoutError(
          'INVALID_QUANTITY',
          400,
          `${sp.product.name}: cantidad debe ser entera para esta unidad de medida`,
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
        
        // Validar que hay suficiente stock para la cantidad solicitada. Con
        // otra unidad de venta la cantidad aún no está en unidad base; esa
        // venta se valida al descontar inventario, ya convertida.
        if (!usesSaleUnit && currentStock < item.quantity) {
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

    // 2. ✅ MÓDULO PH5: Validación Rx server-side (requiresPrescription)
    const enableRestrictedProducts = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_RESTRICTED_PRODUCTS);
    if (enableRestrictedProducts) {
      for (const item of productItems) {
        const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
        if (sp.product.requiresPrescription) {
          // Debe venir rxPatientName o rxObservation en el item
          const hasRxInfo = item.rxPatientName?.trim() || item.rxObservation?.trim() || item.rxPrescriptionNumber?.trim();
          if (!hasRxInfo) {
            throw new CheckoutError(
              'RX_REQUIRED',
              422,
              `${sp.product.name} requiere receta médica. Registre los datos del paciente antes de vender.`,
              { productId: sp.id, productName: sp.product.name }
            );
          }
        }
      }
    }

    // 3. Obtener promociones activas de la tienda
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

    // 3. Validar y calcular descuentos por ítem (con promociones) - SOLO PRODUCTOS
    // Orden: 1) Promo producto → 2) Promo categoría → 3) Volumen pack → 4) N-ésimo → 5) Descuento manual
    
    // ✅ MÓDULO V2: Verificar si conversiones están habilitadas
    const enableConversions = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_CONVERSIONS);
    
    // ✅ MÓDULO F2.3: Verificar si precios por unidad de venta están habilitados
    const enableSellUnitPricing = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_SELLUNIT_PRICING);

    // ✅ MÓDULO PH3: Verificar FEFO y batch expiry flags
    const enableFEFO = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_FEFO_SALES);
    const enableBatchExpiry = await isFeatureEnabled(session.storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);
    
    const itemsWithDiscounts = await Promise.all(productItems.map(async (item) => {
      const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
      
      // ✅ MÓDULO F2.2: Calcular conversión de unidades si está habilitado
      let unitCodeUsed: string | null = null;
      let quantityOriginal: number = item.quantity;
      let quantityBase: number = item.quantity;
      let conversionFactorUsed: number = 1;
      
      if (enableConversions && item.saleUnitId && sp.product.baseUnitId) {
        // ✅ F2.2: Verificar que el flag ENABLE_CONVERSIONS está activo
        // Si saleUnitId != baseUnitId, requiere conversión
        if (item.saleUnitId !== sp.product.baseUnitId) {
          const conversionResult = await normalizeToBaseUnit(
            item.quantity,
            item.saleUnitId,
            sp.product.baseUnitId,
            session.storeId,       // ✅ F2.2: storeId para buscar conversión
            sp.product.id          // ✅ F2.2: productMasterId para buscar conversión
          );
          
          if (!conversionResult.success) {
            // ✅ F2.2: Error detallado si no hay conversión
            throw new CheckoutError(
              'NO_CONVERSION_AVAILABLE',
              400,
              `${sp.product.name}: ${conversionResult.error}`
            );
          }
          
          unitCodeUsed = conversionResult.baseUnitCode;
          quantityOriginal = item.quantity;
          quantityBase = conversionResult.quantityBase;
          conversionFactorUsed = conversionResult.factor;
        }
      } else if (item.saleUnitId && item.saleUnitId !== sp.product.baseUnitId && !enableConversions) {
        // ✅ F2.2: Si intentan usar conversión con flag deshabilitado
        throw new CheckoutError(
          'CONVERSIONS_DISABLED',
          403,
          `${sp.product.name}: Las conversiones de unidades no están habilitadas`
        );
      }
      
      // ✅ MÓDULO F2.3: Verificar si hay precio especial por unidad de venta
      let pricingMode: 'BASE_UNIT' | 'SELL_UNIT_OVERRIDE' = 'BASE_UNIT';
      let sellUnitPriceApplied: number | null = null;
      // Con precio por presentación, SUNAT recibe la línea en la unidad vendida.
      let sellUnitSunatCode: string | null = null;
      let subtotalItem: number;
      
      // Si hay conversión y el flag de precios por sellUnit está activo, buscar override
      if (enableSellUnitPricing && item.saleUnitId && item.saleUnitId !== sp.product.baseUnitId) {
        const sellUnitPrice = await prisma.sellUnitPrice.findFirst({
          where: {
            storeId: session.storeId,
            productMasterId: sp.product.id,
            sellUnitId: item.saleUnitId,
            active: true,
          },
          select: { price: true },
        });
        
        if (sellUnitPrice) {
          // Usar precio especial de la unidad de venta
          pricingMode = 'SELL_UNIT_OVERRIDE';
          sellUnitSunatCode = saleUnits.find((u) => u.id === item.saleUnitId)?.sunatCode ?? null;
          sellUnitPriceApplied = Number(sellUnitPrice.price);
          // Subtotal = cantidad original (en sellUnit) × precio sellUnit
          subtotalItem = quantityOriginal * sellUnitPriceApplied;
        } else {
          // Sin override: usar cantidad base × precio unitario base
          const quantityForCalcs = quantityBase;
          subtotalItem = quantityForCalcs * item.unitPrice;
        }
      } else {
        // Usar quantityBase para cálculos de subtotal y stock (modo normal)
        const quantityForCalcs = quantityBase;
        subtotalItem = quantityForCalcs * item.unitPrice;
      }
      
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

      // PASO 7: Tributos de la línea (afectación IGV del producto e ICBPER por bolsa)
      const lineTaxes = computeLineTaxes({
        lineTotal: totalLine,
        igvAffectation: sp.igvAffectation,
        icbper: sp.icbper,
        quantity: quantityBase,
        saleDate: new Date(),
      });

      return {
        ...item,
        productId: sp.product.id,
        subtotalItem,
        lineTaxes,
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
        // ✅ MÓDULO V2: Campos de conversión de unidades
        unitCodeUsed,
        quantityOriginal,
        quantityBase,
        conversionFactorUsed,
        // ✅ MÓDULO F2.3: Campos de precio por unidad de venta
        pricingMode,
        sellUnitPriceApplied,
        sellUnitSunatCode,
      };
    }));

    // ✅ MÓDULO PH3: FEFO — asignar lotes por orden de vencimiento
    // Estructura: storeProductId → lista de lotes a consumir
    interface BatchConsumed {
      batchId: string;
      batchNumber: string;
      quantity: number;
      expiryDate: Date;
    }
    const fefoAllocation = new Map<string, BatchConsumed[]>();

    if (enableFEFO && enableBatchExpiry) {
      // Leer política de lotes vencidos de la configuración de la tienda
      const storeSettings = await tx.storeSettings.findUnique({
        where: { storeId: session.storeId },
        select: { expiredBatchPolicy: true },
      });
      const blockExpired = (storeSettings?.expiredBatchPolicy ?? 'BLOCK_EXPIRED') === 'BLOCK_EXPIRED';
      const now = new Date();

      for (const item of itemsWithDiscounts) {
        if (!item.storeProductId) continue;

        // Obtener todos los lotes activos con stock disponible, ordenados por vencimiento (FEFO)
        const activeBatches = await tx.productBatch.findMany({
          where: {
            storeProductId: item.storeProductId,
            storeId: session.storeId,
            active: true,
            quantityAvailable: { gt: 0 },
          },
          orderBy: { expiryDate: 'asc' },
        });

        if (activeBatches.length === 0) continue; // Producto sin lotes: usar flujo normal

        // Filtrar vencidos según política
        const usableBatches = blockExpired
          ? activeBatches.filter((b) => b.expiryDate > now)
          : activeBatches;

        const sp = storeProducts.find((p) => p.id === item.storeProductId)!;

        // Si política BLOCK_EXPIRED y todos están vencidos
        if (blockExpired && usableBatches.length === 0) {
          throw new CheckoutError(
            'EXPIRED_BATCH_ONLY',
            409,
            `${sp.product.name}: solo hay lotes vencidos disponibles`,
            { productId: sp.id, productName: sp.product.name }
          );
        }

        // Verificar stock total disponible en lotes usables
        const totalAvailable = usableBatches.reduce(
          (sum, b) => sum + b.quantityAvailable.toNumber(),
          0
        );
        if (totalAvailable < item.quantityBase) {
          throw new CheckoutError(
            'INSUFFICIENT_BATCH_STOCK',
            409,
            `${sp.product.name}: stock insuficiente en lotes (disponible en lotes: ${totalAvailable})`,
            {
              productId: sp.id,
              productName: sp.product.name,
              requested: item.quantityBase,
              available: totalAvailable,
            }
          );
        }

        // Distribuir cantidad a consumir entre lotes (FEFO: primero el que vence antes)
        let remaining = item.quantityBase;
        const consumed: BatchConsumed[] = [];
        for (const batch of usableBatches) {
          if (remaining <= 0) break;
          const take = Math.min(batch.quantityAvailable.toNumber(), remaining);
          consumed.push({
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            quantity: take,
            expiryDate: batch.expiryDate,
          });
          remaining -= take;
        }

        fefoAllocation.set(item.storeProductId, consumed);
      }
    }

    // ✅ MÓDULO F3: Procesar servicios (sin promociones, sin stock)
    const servicesWithTotals = serviceItems.map((item) => {
      const service = validatedServices.find((s) => s.id === item.serviceId)!;
      const subtotalItem = item.quantity * item.unitPrice;
      return {
        serviceId: item.serviceId!,
        serviceName: item.serviceName || service.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotalItem,
        totalLine: subtotalItem,
        taxable: service.taxable,
      };
    });

    // Venta libre: productos sin stock ni ID registrado
    const freeItemsWithTotals = freeItems.map((item) => {
      const subtotalItem = item.quantity * item.unitPrice;
      return {
        productName: item.productName!,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotalItem,
        totalLine: subtotalItem,
      };
    });

    // 4. Calcular totales (productos + servicios + ventas libres)
    const productsSubtotal = itemsWithDiscounts.reduce((sum, item) => sum + item.subtotalItem, 0);
    const servicesSubtotal = servicesWithTotals.reduce((sum, item) => sum + item.subtotalItem, 0);
    const freeItemsSubtotal = freeItemsWithTotals.reduce((sum, item) => sum + item.subtotalItem, 0);
    const subtotalBeforeDiscounts = productsSubtotal + servicesSubtotal + freeItemsSubtotal;
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

    // ICBPER de bolsas: tributo fijo por unidad, no descontable, se suma aparte.
    const icbperTotal = Math.round(
      itemsWithDiscounts.reduce((sum, item) => sum + item.lineTaxes.icbperAmount, 0) * 100
    ) / 100;

    // Total FINAL (después de cupón y descuento global) más ICBPER
    const total = totalAfterCoupon - globalDiscount + icbperTotal;

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

    // 5. Validar y calcular changeAmount si es efectivo o mixto
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
    } else if (paymentMethod === 'MIXED' && paymentSplits && paymentSplits.length >= 2) {
      // ✅ Pago Mixto: validar que la suma de los splits cubre el total
      const totalRounded = Math.round(total * 100) / 100;
      const splitsTotal = paymentSplits.reduce((sum, s) => sum + Math.round(s.amount * 100) / 100, 0);
      const splitsTotalRounded = Math.round(splitsTotal * 100) / 100;

      if (splitsTotalRounded < totalRounded) {
        throw new CheckoutError(
          'AMOUNT_INSUFFICIENT',
          409,
          'La suma de los pagos es menor al total de la venta',
          {
            total: totalRounded.toFixed(2),
            splitsTotal: splitsTotalRounded.toFixed(2),
            missing: (totalRounded - splitsTotalRounded).toFixed(2),
          }
        );
      }
      // El vuelto solo aplica si hay parte en CASH y sobra dinero
      const cashSplit = paymentSplits.find(s => s.method === 'CASH');
      if (cashSplit && splitsTotalRounded > totalRounded) {
        changeAmount = splitsTotalRounded - totalRounded;
      }
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
    let nextSaleNumber: number;
    
    if (isDemoMode) {
      // Si está en Demo Mode: usar rango 99991+
      const lastDemoSale = await tx.sale.findFirst({
        where: {
          storeId: session.storeId,
          isDemo: true,
          saleNumber: { gte: 99991 } // Buscar en rango demo
        },
        orderBy: { saleNumber: 'desc' },
        select: { saleNumber: true },
      });
      nextSaleNumber = (lastDemoSale?.saleNumber ?? 99990) + 1;
    } else {
      // Si NO está en Demo Mode: usar contador normal (< 90000)
      const lastSale = await tx.sale.findFirst({
        where: { 
          storeId: session.storeId,
          isDemo: false, // ✅ Excluir ventas demo del contador
          saleNumber: { lt: 90000 } // ✅ Excluir rango reservado para demos (90000+)
        },
        orderBy: { saleNumber: 'desc' },
        select: { saleNumber: true },
      });
      nextSaleNumber = (lastSale?.saleNumber ?? 0) + 1;
    }

    // 5. Crear Sale con descuentos y cupón
    const saleData: any = {
      id: checkoutSaleId,
      storeId: session.storeId,
      userId: session.userId,
      saleNumber: nextSaleNumber,
      isDemo: isDemoMode, // ✅ Marcar como demo si está en Demo Mode
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
      icbperTotal: new Prisma.Decimal(icbperTotal),
      paymentMethod: paymentMethod,
      paymentDetails: { checkoutRequestHash: checkoutHash },
    };

    // Para FIADO: shiftId es null, amountPaid y changeAmount null, agregar customerId
    if (paymentMethod === 'FIADO') {
      saleData.shiftId = null;
      saleData.amountPaid = null;
      saleData.changeAmount = null;
      saleData.customerId = customerId;
    } else if (paymentMethod === 'MIXED' && paymentSplits) {
      // ✅ Pago Mixto: guardar desglose en paymentDetails
      const splitsTotal = paymentSplits.reduce((sum, s) => sum + s.amount, 0);
      saleData.shiftId = shiftId;
      saleData.amountPaid = new Prisma.Decimal(splitsTotal);
      saleData.changeAmount = changeAmount !== null ? new Prisma.Decimal(changeAmount) : null;
      saleData.paymentDetails = { checkoutRequestHash: checkoutHash, splits: paymentSplits };
    } else {
      // Para otros métodos: shiftId requerido
      saleData.shiftId = shiftId;
      saleData.amountPaid = amountPaid !== undefined ? new Prisma.Decimal(amountPaid) : null;
      saleData.changeAmount = changeAmount !== null ? new Prisma.Decimal(changeAmount) : null;
    }

    const sale = await tx.sale.create({ data: saleData });

    // 6. Crear SaleItems con snapshot y descuentos
    // 6. Crear SaleItems con snapshot y descuentos (PRODUCTOS)
    const productSaleItems = await Promise.all(
      itemsWithDiscounts.map((item) => {
        const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
        return tx.saleItem.create({
          data: {
            saleId: sale.id,
            storeProductId: item.storeProductId!,
            productName: sp.product.name,
            productContent: sp.product.content,
            unitType: sp.product.unitType,
            // ✅ SUNAT: Snapshot de unidad para facturación electrónica
            unitSunatCode: sp.product.baseUnit?.sunatCode ?? (sp.product.unitType === 'KG' ? 'KGM' : 'NIU'),
            unitSymbol: sp.product.baseUnit?.symbol ?? (sp.product.unitType === 'KG' ? 'kg' : 'und'),
            quantity: new Prisma.Decimal(item.quantityBase), // ✅ V2: Usar quantityBase para inventario
            unitPrice: new Prisma.Decimal(item.unitPrice),
            costPrice: sp.costPrice ?? null, // Snapshot del costo al momento de la venta
            subtotal: new Prisma.Decimal(item.subtotalItem),
            // ✅ MÓDULO F2: Snapshot de conversión de unidades
            unitCodeUsed: item.unitCodeUsed || null,
            quantityBase: item.conversionFactorUsed !== 1 ? new Prisma.Decimal(item.quantityBase) : null,
            conversionFactorUsed: item.conversionFactorUsed !== 1 ? new Prisma.Decimal(item.conversionFactorUsed) : null,
            // ✅ MÓDULO F2.3: Snapshot de precio por presentación
            quantityOriginal: item.quantityOriginal !== item.quantityBase ? new Prisma.Decimal(item.quantityOriginal) : null,
            pricingMode: item.pricingMode,
            sellUnitPriceApplied: item.sellUnitPriceApplied !== null ? new Prisma.Decimal(item.sellUnitPriceApplied) : null,
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
            // Tributos de la línea (snapshot)
            igvAffectation: item.lineTaxes.igvAffectation,
            taxableAmount: new Prisma.Decimal(item.lineTaxes.taxableAmount),
            igvAmount: new Prisma.Decimal(item.lineTaxes.igvAmount),
            icbperQuantity: item.lineTaxes.icbperQuantity !== null ? new Prisma.Decimal(item.lineTaxes.icbperQuantity) : null,
            icbperAmount: new Prisma.Decimal(item.lineTaxes.icbperAmount),
            // ✅ F3: No es servicio
            isService: false,
            // ✅ MÓDULO PH8: Snapshot farmacéutico
            commercialName: sp.product.commercialName || null,
            genericName: sp.product.genericName || null,
            concentration: sp.product.concentration || null,
            pharmaceuticalForm: sp.product.pharmaceuticalForm || null,
            // Con precio por presentación se informa la unidad vendida (rollo, caja).
            unitSunatCodeUsed: item.sellUnitSunatCode
              ?? sp.product.baseUnit?.sunatCode
              ?? (sp.product.unitType === 'KG' ? 'KGM' : 'NIU'),
            // ✅ MÓDULO PH3: snapshot de lotes consumidos (FEFO)
            batchBreakdown: (() => {
              const alloc = fefoAllocation.get(item.storeProductId!);
              if (!alloc || alloc.length === 0) return undefined;
              return alloc.map((bc) => ({
                batchNumber: bc.batchNumber,
                qty: bc.quantity,
                expiry: bc.expiryDate.toISOString().split('T')[0],
              }));
            })(),
          },
        });
      })
    );

    // ✅ MÓDULO F3: Crear SaleItems para SERVICIOS
    const serviceSaleItems = await Promise.all(
      servicesWithTotals.map((item) => {
        return tx.saleItem.create({
          data: {
            saleId: sale.id,
            serviceId: item.serviceId,
            isService: true,
            productName: item.serviceName, // Reutilizamos campo para nombre
            productContent: '(Servicio)', // Indica que es servicio
            unitType: 'UNIT', // Servicios siempre en unidades
            // ✅ SUNAT: Servicios usan ZZ (mutuo acuerdo)
            unitSunatCode: 'ZZ',
            unitSymbol: 'serv',
            unitSunatCodeUsed: 'ZZ', // ✅ PH8: Código SUNAT para servicios
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            subtotal: new Prisma.Decimal(item.subtotalItem),
            totalLine: new Prisma.Decimal(item.totalLine),
            // Sin promociones para servicios
            promotionDiscount: new Prisma.Decimal(0),
            categoryPromoDiscount: new Prisma.Decimal(0),
            volumePromoDiscount: new Prisma.Decimal(0),
            nthPromoDiscount: new Prisma.Decimal(0),
            discountAmount: new Prisma.Decimal(0),
          },
        });
      })
    );

    // Crear SaleItems para ventas libres
    const freeItemSaleItems = await Promise.all(
      freeItemsWithTotals.map((item) =>
        tx.saleItem.create({
          data: {
            saleId: sale.id,
            isService: false,
            productName: item.productName,
            productContent: '(Venta libre)',
            unitType: 'UNIT',
            unitSunatCode: 'NIU',
            unitSymbol: 'und',
            unitSunatCodeUsed: 'NIU',
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            subtotal: new Prisma.Decimal(item.subtotalItem),
            totalLine: new Prisma.Decimal(item.totalLine),
            promotionDiscount: new Prisma.Decimal(0),
            categoryPromoDiscount: new Prisma.Decimal(0),
            volumePromoDiscount: new Prisma.Decimal(0),
            nthPromoDiscount: new Prisma.Decimal(0),
            discountAmount: new Prisma.Decimal(0),
          },
        })
      )
    );

    const saleItems = [...productSaleItems, ...serviceSaleItems, ...freeItemSaleItems];

    // La trazabilidad farmacéutica forma parte de la misma transacción que la venta.
    // Una referencia inválida revierte también la venta y el descuento de stock.
    try {
      await registerPharmacyTrace(tx, {
        storeId: session.storeId,
        userId: session.userId,
        sale: {
          id: sale.id,
          saleNumber: sale.saleNumber,
          createdAt: sale.createdAt,
        },
        productLines: itemsWithDiscounts.map((item, index) => {
          const sp = storeProducts.find((product) => product.id === item.storeProductId)!;
          const saleItem = productSaleItems[index];
          return {
            saleItemId: saleItem.id,
            productName: sp.product.name,
            genericName: sp.product.genericName || null,
            concentration: sp.product.concentration || null,
            laboratory: sp.product.laboratory || null,
            quantity: saleItem.quantity,
            batchBreakdown: saleItem.batchBreakdown ?? null,
            requiresPrescription: sp.product.requiresPrescription,
            prescriptionNumber: item.rxPrescriptionNumber,
            observation: item.rxObservation,
          };
        }),
        patientId,
        prescribedBy,
        cmpNumber,
        consultReason,
      });
    } catch (error) {
      if (error instanceof PharmacyTraceError) {
        throw new CheckoutError(error.code, error.statusCode, error.message);
      }
      throw error;
    }

    // 7. Crear Movements — SOLO PRODUCTOS
    // Si FEFO está activo y el item tiene asignación de lotes: un movement por lote consumido.
    // Si no, un único movement por item (flujo original).
    await Promise.all(
      itemsWithDiscounts.map((item) => {
        const batchAlloc = fefoAllocation.get(item.storeProductId!);
        if (batchAlloc && batchAlloc.length > 0) {
          // ✅ FEFO: un movement por lote, con batchId
          return Promise.all(
            batchAlloc.map((bc) =>
              tx.movement.create({
                data: {
                  storeId: session.storeId,
                  storeProductId: item.storeProductId!,
                  batchId: bc.batchId,
                  type: 'SALE',
                  quantity: new Prisma.Decimal(-bc.quantity),
                  unitPrice: new Prisma.Decimal(item.unitPrice),
                  total: new Prisma.Decimal(
                    item.quantityBase > 0
                      ? (bc.quantity / item.quantityBase) * item.subtotalItem
                      : 0
                  ),
                  notes: `Venta #${nextSaleNumber} - Lote ${bc.batchNumber}`,
                  createdById: session.userId,
                  isDemo: isDemoMode,
                },
              })
            )
          );
        }
        // Flujo normal (sin FEFO o producto sin lotes)
        return tx.movement.create({
          data: {
            storeId: session.storeId,
            storeProductId: item.storeProductId!,
            type: 'SALE',
            quantity: new Prisma.Decimal(-item.quantityBase),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            total: new Prisma.Decimal(item.subtotalItem),
            notes: `Venta #${nextSaleNumber}`,
            createdById: session.userId,
            isDemo: isDemoMode,
          },
        });
      })
    );

    // 7b/8. Consumir stock general y lotes con updates condicionales atómicos.
    // Si otra operación consumió existencias desde la lectura inicial, el helper
    // falla y toda la transacción de venta se revierte.
    try {
      await consumeSaleInventory(tx, {
        storeId: session.storeId,
        products: itemsWithDiscounts
          .filter((item) => Boolean(item.storeProductId))
          .map((item) => {
            const sp = storeProducts.find((product) => product.id === item.storeProductId)!;
            return {
              storeProductId: item.storeProductId!,
              productName: sp.product.name,
              quantity: item.quantityBase,
              tracksStock: sp.stock !== null,
            };
          }),
        batches: [...fefoAllocation.entries()].flatMap(([storeProductId, consumed]) =>
          consumed.map((batch) => ({
            storeProductId,
            batchId: batch.batchId,
            batchNumber: batch.batchNumber,
            quantity: batch.quantity,
          }))
        ),
      });
    } catch (error) {
      if (error instanceof InventoryMutationError) {
        throw new CheckoutError(error.code, 409, error.message, error.details);
      }
      throw error;
    }

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
    const session = await getCurrentStoreUser();
    if (!session) {
      const error: ErrorResponse = {
        code: 'UNAUTHORIZED',
        message: 'No autenticado',
      };
      return NextResponse.json(error, { status: 401 });
    }

    let idempotencyKey: string;
    try {
      idempotencyKey = parseCheckoutIdempotencyKey(req.headers.get('idempotency-key'));
    } catch (error) {
      return NextResponse.json({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: error instanceof Error ? error.message : 'Idempotency-Key invalida',
      }, { status: 400 });
    }

    const body: CheckoutBody = await req.json();
    const requestHash = createCheckoutRequestHash(body);
    const checkoutSaleId = createCheckoutSaleId(session.storeId, session.userId, idempotencyKey);

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

    // Una repeticion solo puede consultar la venta despues de revalidar la
    // tienda, el usuario y su rol actual. Esto evita devolver datos a una
    // sesion que fue deshabilitada despues del primer intento.
    const persistedCheckout = await findPersistedCheckout(session.storeId, session.userId, checkoutSaleId);
    if (persistedCheckout) {
      if (getCheckoutRequestHash(persistedCheckout.paymentDetails) !== requestHash) {
        return NextResponse.json({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'La misma Idempotency-Key no puede reutilizarse para otra venta',
        }, { status: 409 });
      }
      return NextResponse.json(persistedCheckoutPayload(persistedCheckout, true), { status: 200 });
    }

    // El replay exitoso no consume cuota; una solicitud nueva si queda sujeta
    // al limite por usuario.
    const rateLimitResult = checkRateLimit('checkout', session.userId);
    if (!rateLimitResult.allowed) {
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

    const { items, paymentMethod, amountPaid, customerId, discountTotal, couponCode, patientId, prescribedBy, cmpNumber, consultReason, paymentSplits } = body;

    // Validaciones básicas
    if (!items || items.length === 0) {
      const error: ErrorResponse = {
        code: 'EMPTY_CART',
        message: 'El carrito está vacío',
      };
      return NextResponse.json(error, { status: 400 });
    }

    // Validar paymentMethod
    if (!paymentMethod || !['CASH', 'YAPE', 'PLIN', 'CARD', 'FIADO', 'MIXED'].includes(paymentMethod)) {
      const error: ErrorResponse = {
        code: 'INVALID_PAYMENT_METHOD',
        message: 'Método de pago inválido',
        details: { allowedMethods: ['CASH', 'YAPE', 'PLIN', 'CARD', 'FIADO', 'MIXED'] },
      };
      return NextResponse.json(error, { status: 400 });
    }

    // Validar amountPaid según método de pago
    if (paymentMethod === 'MIXED') {
      // Validar paymentSplits para pago mixto
      if (!paymentSplits || !Array.isArray(paymentSplits) || paymentSplits.length < 2) {
        const error: ErrorResponse = {
          code: 'SPLITS_REQUIRED',
          message: 'Pago mixto requiere al menos 2 métodos de pago',
        };
        return NextResponse.json(error, { status: 400 });
      }
      const validSplitMethods = ['CASH', 'YAPE', 'PLIN', 'CARD'];
      for (const split of paymentSplits) {
        if (!validSplitMethods.includes(split.method) || typeof split.amount !== 'number' || split.amount <= 0) {
          const error: ErrorResponse = {
            code: 'INVALID_SPLIT',
            message: 'Cada split debe tener un método válido (CASH, YAPE, PLIN, CARD) y un monto mayor a 0',
          };
          return NextResponse.json(error, { status: 400 });
        }
      }
    } else if (paymentMethod === 'CASH') {
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
      // Servicios no tienen storeProductId — validar serviceId en su lugar
      if (item.isService) {
        if (!item.serviceId || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
          const error: ErrorResponse = {
            code: 'INVALID_ITEM_FORMAT',
            message: 'Formato de servicio inválido',
            details: { requiredFields: ['serviceId', 'quantity', 'unitPrice'] },
          };
          return NextResponse.json(error, { status: 400 });
        }
      } else if (item.isFreeItem) {
        // Venta libre: no tiene storeProductId, requiere productName
        if (!item.productName || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
          const error: ErrorResponse = {
            code: 'INVALID_ITEM_FORMAT',
            message: 'Formato de venta libre inválido',
            details: { requiredFields: ['productName', 'quantity', 'unitPrice'] },
          };
          return NextResponse.json(error, { status: 400 });
        }
      } else {
        if (!item.storeProductId || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
          const error: ErrorResponse = {
            code: 'INVALID_ITEM_FORMAT',
            message: 'Formato de item inválido',
            details: { requiredFields: ['storeProductId', 'quantity', 'unitPrice'] },
          };
          return NextResponse.json(error, { status: 400 });
        }
      }
    }

    // VALIDACIÓN CRÍTICA: Verificar que hay turno abierto (excepto para FIADO)
    let currentShift = null;
    if (paymentMethod !== 'FIADO') {
      currentShift = await shiftRepo.getCurrentShift(session.storeId, session.userId);

      if (!currentShift) {
        const error: ErrorResponse = {
          code: 'SHIFT_REQUIRED',
          message: 'No tienes un turno abierto. Ve a Turnos y abre tu turno antes de realizar ventas.',
        };
        return NextResponse.json(error, { status: 409 });
      }
    }

    // Evita dos checkouts simultaneos en este proceso. La restriccion unica
    // persistente protege ademas frente a reinicios y multiples procesos.
    lockAcquired = acquireCheckoutLock(session.storeId, session.userId);
    if (!lockAcquired) {
      return NextResponse.json({
        code: 'CHECKOUT_IN_PROGRESS',
        message: 'Ya tienes una venta en proceso. Espera a que termine.',
      }, { status: 409 });
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
          checkoutSaleId,
          requestHash,
          amountPaid,
          customerId,
          discountTotal,
          couponCode,
          paymentSplits,
          patientId,
          prescribedBy,
          cmpNumber,
          consultReason
        );
        break; // Éxito, salir del bucle
      } catch (error: any) {
        lastError = error;

        if (error?.code === 'P2002') {
          const existing = await findPersistedCheckout(session.storeId, session.userId, checkoutSaleId);
          if (existing && getCheckoutRequestHash(existing.paymentDetails) === requestHash) {
            releaseCheckoutLock(session.storeId, session.userId);
            lockAcquired = false;
            return NextResponse.json(persistedCheckoutPayload(existing, true), { status: 200 });
          }
          if (existing) {
            throw new CheckoutError(
              'IDEMPOTENCY_KEY_REUSED',
              409,
              'La misma Idempotency-Key no puede reutilizarse para otra venta'
            );
          }
        }
        
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
        const sessionData = await getCurrentStoreUser();
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
      const sessionData = await getCurrentStoreUser();
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
