import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStoreUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentStoreUser();
    if (!session) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('shiftId');
    const query = searchParams.get('query'); // Search by saleNumber
    const from = searchParams.get('from'); // Date from
    const to = searchParams.get('to'); // Date to

    // Verificar si la tienda está en Demo Mode
    const store = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { isDemoStore: true }
    });
    const isDemoMode = store?.isDemoStore ?? false;

    // Build where clause
    const where: any = {
      storeId: session.storeId,
      // ✅ Si NO está en demo mode, excluir ventas demo
      ...(isDemoMode ? {} : { isDemo: false })
    };

    // Filter by shift
    if (shiftId) {
      where.shiftId = shiftId;
    }

    // Filter by cashier for CASHIER role
    if (session.role === 'CASHIER' && !shiftId) {
      where.userId = session.userId;
    }

    // Search by sale number
    if (query) {
      where.saleNumber = {
        contains: query,
        mode: 'insensitive',
      };
    }

    // Date range filter
    if (from || to) {
      where.createdAt = {};
      if (from) {
        // Parse date in Peru timezone (UTC-5)
        where.createdAt.gte = new Date(from + 'T00:00:00.000-05:00');
      }
      if (to) {
        // Parse date in Peru timezone (UTC-5)
        where.createdAt.lte = new Date(to + 'T23:59:59.999-05:00');
      }
    }

    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const page = Math.max(1, parseInt(pageParam || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || '20', 10)));
    const skip = (page - 1) * limit;

    // ✅ MÓDULO PH4: Verificar si el módulo de pacientes está activo
    const patientsEnabled = await isFeatureEnabled(session.storeId as string, FeatureFlagKey.ENABLE_PATIENTS);

    const [total, sales] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include: {
          items: {
            include: {
              storeProduct: {
                include: {
                  product: true,
                },
              },
            },
          },
          user: {
            select: {
              name: true,
            },
          },
          // ✅ MÓDULO PH4: Incluir paciente si el módulo está activo
          ...(patientsEnabled ? {
            patientMedications: {
              take: 1,
              include: {
                patient: {
                  select: { id: true, name: true, dni: true },
                },
              },
            },
          } : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
    ]);

    // Calculate promotionsTotal and categoryPromotionsTotal for each sale
    const salesWithPromotions = sales.map(sale => {
      const promotionsTotal = sale.items.reduce((sum, item) => {
        return sum + (item.promotionDiscount ? Number(item.promotionDiscount) : 0);
      }, 0);

      const categoryPromotionsTotal = sale.items.reduce((sum, item) => {
        return sum + (item.categoryPromoDiscount ? Number(item.categoryPromoDiscount) : 0);
      }, 0);

      const volumePromotionsTotal = sale.items.reduce((sum, item) => {
        return sum + (item.volumePromoDiscount ? Number(item.volumePromoDiscount) : 0);
      }, 0);

      const nthPromotionsTotal = sale.items.reduce((sum, item) => {
        return sum + (item.nthPromoDiscount ? Number(item.nthPromoDiscount) : 0);
      }, 0);

      return {
        ...sale,
        promotionsTotal,
        categoryPromotionsTotal,
        volumePromotionsTotal,
        nthPromotionsTotal,
        // ✅ MÓDULO PH4: Paciente/receptor de la venta
        patientName: (sale as any).patientMedications?.[0]?.patient?.name || null,
        patientDni: (sale as any).patientMedications?.[0]?.patient?.dni || null,
      };
    });

    return NextResponse.json({
      sales: salesWithPromotions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener ventas' },
      { status: 500 }
    );
  }
}
