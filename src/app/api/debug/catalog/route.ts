import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'SUPERADMIN' && !isSuperAdmin(user.email))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const catalogSettings = await prisma.catalogSettings.findMany({
      select: {
        id: true,
        storeId: true,
        enabled: true,
        storeSlug: true,
        storeName: true,
        catalogStatus: true,
        whatsappNumber: true,
        storeLogoPath: true,
        storeBannerPath: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    const products = await prisma.storeProduct.findMany({
      where: {
        catalogVisible: true,
      },
      select: {
        id: true,
        storeId: true,
        catalogTitle: true,
        catalogCategory: true,
        catalogImagePath: true,
        catalogVisible: true,
      },
      take: 10
    });

    return NextResponse.json({
      catalogSettings,
      productsCount: products.length,
      products: products.slice(0, 5),
    });
  } catch (error) {
    console.error('[debug/catalog] Error interno:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
