import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStoreUser } from '@/lib/session';
import { PrismaStoreProductRepository } from '@/infra/db/repositories/PrismaStoreProductRepository';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';

const storeProductRepo = new PrismaStoreProductRepository();

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentStoreUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('query') || undefined;
    const category = searchParams.get('category') || undefined;
    const lowStock = searchParams.get('lowStock') === 'true';
    const active = searchParams.get('active');
    const productId = searchParams.get('productId') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    // ✅ MÓDULO 17.2: Si hay productId, buscar directamente
    if (productId) {
      const product = await storeProductRepo.findByStoreAndProduct(user.storeId, productId);
      if (!product) {
        return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
      }
      return NextResponse.json([product]); // Devolver array para mantener consistencia
    }

    // ✅ MÓDULO PH5: Búsqueda farmacéutica avanzada activa sólo si el flag está ON
    const pharmaSearch = user.storeId
      ? await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_MEDICINE_SEARCH)
      : false;

    const filters = {
      query,
      category,
      lowStock,
      active: active !== null ? active === 'true' : undefined,
      limit: query ? undefined : limit,
      offset: query ? undefined : (page - 1) * limit,
      pharmaSearch,
    };

    const products = await storeProductRepo.findByStoreId(user.storeId, filters as any);

    // Contar total con query eficiente (sin traer datos)
    const countFilters = { query, category, lowStock, active: active !== null ? active === 'true' : undefined };
    const total = query ? products.length : await storeProductRepo.countByStoreId(user.storeId, countFilters);

    // ✅ MÓDULO PH3: Enriquecer con info de lotes (vencimiento) si ENABLE_BATCH_EXPIRY
    const batchExpiryEnabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_BATCH_EXPIRY);
    let enrichedProducts = products;
    if (batchExpiryEnabled && products.length > 0) {
      const spIds = products.map((p: any) => p.id);
      const now = new Date();

      // Una sola query: lote activo más próximo a vencer por storeProduct
      const nearestBatches = await prisma.productBatch.findMany({
        where: {
          storeProductId: { in: spIds },
          active: true,
          quantityAvailable: { gt: 0 },
        },
        select: {
          storeProductId: true,
          expiryDate: true,
        },
        orderBy: { expiryDate: 'asc' },
      });

      // Construir mapa: storeProductId → { nearestExpiry, hasExpired }
      const batchMap = new Map<string, { nearestExpiry: string; hasExpired: boolean }>();
      for (const b of nearestBatches) {
        const existing = batchMap.get(b.storeProductId);
        const expired = b.expiryDate < now;
        if (!existing) {
          batchMap.set(b.storeProductId, {
            nearestExpiry: b.expiryDate.toISOString(),
            hasExpired: expired,
          });
        } else if (expired && !existing.hasExpired) {
          // Si hay algún lote vencido, marcar
          existing.hasExpired = true;
        }
      }

      enrichedProducts = products.map((p: any) => ({
        ...p,
        batchInfo: batchMap.get(p.id) || null,
      }));
    }

    return NextResponse.json({
      products: enrichedProducts,
      count: enrichedProducts.length,
      total,
      page,
      limit,
      totalPages: query ? 1 : Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json(
      { error: 'Error al obtener inventario' },
      { status: 500 }
    );
  }
}