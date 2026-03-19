import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

const CLOUD_URL = (process.env.CLOUD_URL || '').replace(/\/+$/, '');
const CATALOG_API_KEY = process.env.CATALOG_API_KEY || '';

export async function POST(_req: NextRequest) {
  if (process.env.DESKTOP_MODE !== 'true') {
    return NextResponse.json({ error: 'Solo disponible en modo desktop' }, { status: 403 });
  }

  const session = await getSession();
  if (!session?.storeId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!CLOUD_URL) {
    return NextResponse.json(
      { error: 'CLOUD_URL no configurado — contacta al administrador del sistema' },
      { status: 503 },
    );
  }

  try {
    // 1. Leer configuración local del catálogo
    let settings: any = null;
    try {
      settings = await prisma.catalogSettings.findUnique({
        where: { storeId: session.storeId },
      });
    } catch {
      // tabla no existe en BD antigua
    }

    const slug = settings?.storeSlug?.trim();
    if (!slug) {
      return NextResponse.json(
        { error: 'Configura la ruta personalizada (slug) del catálogo antes de publicar' },
        { status: 400 },
      );
    }

    // Solo enviar imágenes si son URLs de Cloudinary (no rutas locales)
    const logoUrl = (settings?.storeLogoPath || '').startsWith('http')
      ? settings.storeLogoPath
      : null;
    const bannerUrl = (settings?.storeBannerPath || '').startsWith('http')
      ? settings.storeBannerPath
      : null;

    // 2. Leer productos marcados para el catálogo
    let products: any[] = [];
    try {
      const storeProducts = await prisma.storeProduct.findMany({
        where: { storeId: session.storeId, publishInCatalog: true },
        include: { product: true },
      });

      products = storeProducts.map((sp) => ({
        localProductId: sp.id,
        name: (sp as any).catalogTitle || sp.product.name,
        description: (sp as any).catalogDescription || sp.product.content || '',
        price: Number(sp.price),
        category: (sp as any).catalogCategory || sp.product.category || 'General',
        imageUrl: ((sp as any).catalogImagePath || sp.product.imageUrl || '').startsWith('http')
          ? ((sp as any).catalogImagePath || sp.product.imageUrl)
          : null,
        visible: (sp as any).catalogVisible ?? true,
        updatedAt: (sp as any).catalogUpdatedAt?.toISOString() ?? null,
      }));
    } catch {
      // columnas catálogo no existen en BD antigua — intentar sin ellas
      try {
        const storeProducts = await prisma.storeProduct.findMany({
          where: { storeId: session.storeId },
          include: { product: true },
          take: 100,
        });
        products = storeProducts.map((sp) => ({
          localProductId: sp.id,
          name: sp.product.name,
          description: sp.product.content || '',
          price: Number(sp.price),
          category: sp.product.category || 'General',
          imageUrl: sp.product.imageUrl?.startsWith('http') ? sp.product.imageUrl : null,
          visible: true,
          updatedAt: null,
        }));
      } catch {
        // ignorar
      }
    }

    if (products.length === 0) {
      return NextResponse.json(
        {
          error:
            'Marca al menos un producto como "Mostrar en Catálogo" en el inventario antes de publicar',
        },
        { status: 400 },
      );
    }

    // 3. Nombre de la tienda
    let storeName = 'Mi Tienda';
    try {
      const store = await prisma.store.findUnique({ where: { id: session.storeId } });
      storeName = store?.name || 'Mi Tienda';
    } catch {
      // ignorar
    }

    // 4. Publicar en la nube
    const payload = {
      storeId: session.storeId,
      storeName,
      slug,
      whatsappNumber: settings?.whatsappNumber || '',
      logoUrl,
      bannerUrl,
      products,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (CATALOG_API_KEY) headers['x-api-key'] = CATALOG_API_KEY;

    const cloudRes = await fetch(`${CLOUD_URL}/api/catalog/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    if (!cloudRes.ok) {
      const errText = await cloudRes.text();
      console.error('[publish-catalog] Cloud error:', cloudRes.status, errText);
      return NextResponse.json(
        { error: `Error al publicar: el servidor web respondió ${cloudRes.status}` },
        { status: 502 },
      );
    }

    const result = await cloudRes.json();

    // 5. Actualizar catalogUrl en la BD local
    try {
      await prisma.catalogSettings.update({
        where: { storeId: session.storeId },
        data: {
          catalogUrl: result.catalogUrl,
          catalogStatus: 'PUBLISHED',
          lastPublishedAt: new Date(),
        },
      });
    } catch {
      // ignorar errores de actualización local
    }

    return NextResponse.json({ success: true, catalogUrl: result.catalogUrl });
  } catch (error) {
    console.error('[publish-catalog] Error:', error);
    return NextResponse.json({ error: 'Error al publicar el catálogo' }, { status: 500 });
  }
}
