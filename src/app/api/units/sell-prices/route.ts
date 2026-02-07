/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.3 — API DE PRECIOS POR PRESENTACIÓN
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * GET /api/units/sell-prices?productMasterId=xxx
 * - Lista overrides activos para un producto
 * 
 * POST /api/units/sell-prices
 * - Crea/actualiza precio override por presentación
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSessionOrThrow } from '@/lib/session';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    
    const { searchParams } = new URL(req.url);
    const productMasterId = searchParams.get('productMasterId');
    
    if (!productMasterId) {
      return NextResponse.json(
        { error: 'productMasterId es requerido' },
        { status: 400 }
      );
    }
    
    // Verificar flag
    const enabled = await isFeatureEnabled(
      session.storeId,
      FeatureFlagKey.ENABLE_SELLUNIT_PRICING
    );
    
    if (!enabled) {
      return NextResponse.json({
        prices: [],
        enabled: false,
      });
    }
    
    // Obtener precios por presentación
    const prices = await prisma.sellUnitPrice.findMany({
      where: {
        storeId: session.storeId,
        productMasterId,
        active: true,
      },
      include: {
        sellUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
            sunatCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // También obtener el precio base para referencia
    const storeProduct = await prisma.storeProduct.findFirst({
      where: {
        storeId: session.storeId,
        productId: productMasterId,
      },
      select: {
        price: true,
        product: {
          select: {
            baseUnit: {
              select: {
                id: true,
                code: true,
                name: true,
                symbol: true,
              },
            },
          },
        },
      },
    });
    
    return NextResponse.json({
      prices: prices.map(p => ({
        id: p.id,
        sellUnitId: p.sellUnitId,
        sellUnit: p.sellUnit,
        price: p.price.toNumber(),
        notes: p.notes,
        active: p.active,
        createdAt: p.createdAt,
      })),
      basePrice: storeProduct?.price?.toNumber() ?? null,
      baseUnit: storeProduct?.product?.baseUnit ?? null,
      enabled: true,
    });
  } catch (error: any) {
    console.error('Error getting sell unit prices:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener precios' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    
    // Solo OWNER puede configurar precios
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede configurar precios' },
        { status: 403 }
      );
    }
    
    // Verificar flag
    const enabled = await isFeatureEnabled(
      session.storeId,
      FeatureFlagKey.ENABLE_SELLUNIT_PRICING
    );
    
    if (!enabled) {
      return NextResponse.json(
        { error: 'SELLUNIT_PRICING_DISABLED', message: 'Precios por presentación no están habilitados' },
        { status: 403 }
      );
    }
    
    const body = await req.json();
    const { productMasterId, sellUnitId, price, notes } = body;
    
    // Validaciones básicas
    if (!productMasterId || !sellUnitId) {
      return NextResponse.json(
        { error: 'productMasterId y sellUnitId son requeridos' },
        { status: 400 }
      );
    }
    
    if (typeof price !== 'number' || price <= 0) {
      return NextResponse.json(
        { error: 'El precio debe ser un número mayor a 0' },
        { status: 400 }
      );
    }
    
    // Verificar que el producto existe y pertenece a la tienda
    const storeProduct = await prisma.storeProduct.findFirst({
      where: {
        storeId: session.storeId,
        productId: productMasterId,
      },
      include: {
        product: {
          select: {
            baseUnitId: true,
          },
        },
      },
    });
    
    if (!storeProduct) {
      return NextResponse.json(
        { error: 'Producto no encontrado en esta tienda' },
        { status: 404 }
      );
    }
    
    // Verificar que sellUnitId no es la unidad base (no tiene sentido override)
    if (storeProduct.product.baseUnitId === sellUnitId) {
      return NextResponse.json(
        { error: 'No puedes crear un precio override para la unidad base. Usa el precio del producto.' },
        { status: 400 }
      );
    }
    
    // Verificar que existe conversión activa para esta unidad
    const conversion = await prisma.unitConversion.findFirst({
      where: {
        storeId: session.storeId,
        productMasterId,
        fromUnitId: sellUnitId,
        active: true,
      },
    });
    
    if (!conversion) {
      return NextResponse.json(
        { error: 'Debes configurar primero una conversión para esta unidad antes de asignar un precio' },
        { status: 400 }
      );
    }
    
    // Verificar que la unidad existe
    const unit = await prisma.unit.findUnique({
      where: { id: sellUnitId },
    });
    
    if (!unit) {
      return NextResponse.json(
        { error: 'Unidad no encontrada' },
        { status: 404 }
      );
    }
    
    // Crear o actualizar (upsert)
    const sellUnitPrice = await prisma.sellUnitPrice.upsert({
      where: {
        storeId_productMasterId_sellUnitId: {
          storeId: session.storeId,
          productMasterId,
          sellUnitId,
        },
      },
      update: {
        price,
        notes: notes || null,
        active: true,
      },
      create: {
        storeId: session.storeId,
        productMasterId,
        sellUnitId,
        price,
        notes: notes || null,
      },
      include: {
        sellUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
          },
        },
      },
    });
    
    return NextResponse.json({
      id: sellUnitPrice.id,
      sellUnitId: sellUnitPrice.sellUnitId,
      sellUnit: sellUnitPrice.sellUnit,
      price: sellUnitPrice.price.toNumber(),
      notes: sellUnitPrice.notes,
      active: sellUnitPrice.active,
    });
  } catch (error: any) {
    console.error('Error creating sell unit price:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear precio' },
      { status: 500 }
    );
  }
}
