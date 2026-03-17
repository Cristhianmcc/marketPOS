import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
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
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
