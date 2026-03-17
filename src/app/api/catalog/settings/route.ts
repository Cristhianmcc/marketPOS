import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!session?.storeId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    let settings: any = null;

    try {
      settings = await prisma.catalogSettings.findUnique({
        where: { storeId: session.storeId },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Backward compat: old desktop DBs may not have social columns yet.
      if (
        msg.includes('Unknown field') ||
        msg.includes('facebookUrl') ||
        msg.includes('instagramUrl') ||
        msg.includes('tiktokUrl') ||
        msg.includes('facebook_url') ||
        msg.includes('instagram_url') ||
        msg.includes('tiktok_url') ||
        msg.includes('does not exist')
      ) {
        settings = await prisma.catalogSettings.findUnique({
          where: { storeId: session.storeId },
          select: {
            id: true,
            storeId: true,
            enabled: true,
            storeSlug: true,
            whatsappNumber: true,
            storeLogoPath: true,
            storeBannerPath: true,
            catalogStatus: true,
            lastPublishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      } else {
        throw err;
      }
    }

    if (!settings) {
      return NextResponse.json({
        enabled: false,
        slug: '',
        whatsappNumber: '',
        facebookUrl: '',
        instagramUrl: '',
        tiktokUrl: '',
        storeLogoPath: '',
        storeBannerPath: '',
      });
    }

    return NextResponse.json({
      ...settings,
      slug: settings.storeSlug,
      facebookUrl: (settings as any).facebookUrl ?? '',
      instagramUrl: (settings as any).instagramUrl ?? '',
      tiktokUrl: (settings as any).tiktokUrl ?? '',
    });
  } catch (error) {
    console.error('Error fetching catalog settings:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.storeId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      enabled,
      slug,
      whatsappNumber,
      storeLogoPath,
      storeBannerPath,
      facebookUrl,
      instagramUrl,
      tiktokUrl,
    } = body;

    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: 'Slug invalido (solo letras minusculas, numeros y guiones)' },
        { status: 400 },
      );
    }

    if (slug) {
      const existing = await prisma.catalogSettings.findFirst({
        where: {
          storeSlug: slug,
          NOT: { storeId: session.storeId },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: 'Este slug ya esta en uso por otra tienda' },
          { status: 400 },
        );
      }
    }

    const publicBaseUrl =
      process.env.PUBLIC_CATALOG_BASE_URL ||
      process.env.NEXT_PUBLIC_CATALOG_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      new URL(req.url).origin;

    const normalizedSlug = (slug || '').replace(/^\/+|\/+$/g, '');
    const computedCatalogUrl = normalizedSlug
      ? `${publicBaseUrl.replace(/\/+$/, '')}/c/${normalizedSlug}`
      : null;

    const baseUpdate = {
      enabled: !!enabled,
      storeSlug: slug || null,
      whatsappNumber: whatsappNumber || '',
      storeLogoPath: storeLogoPath || null,
      storeBannerPath: storeBannerPath || null,
      catalogUrl: enabled ? computedCatalogUrl : null,
      catalogStatus: enabled ? 'PUBLISHED' : 'DRAFT',
    } as const;

    const updateWithSocial = {
      ...baseUpdate,
      facebookUrl: facebookUrl || null,
      instagramUrl: instagramUrl || null,
      tiktokUrl: tiktokUrl || null,
    };

    const createWithSocial = {
      storeId: session.storeId,
      ...baseUpdate,
      facebookUrl: facebookUrl || null,
      instagramUrl: instagramUrl || null,
      tiktokUrl: tiktokUrl || null,
    };

    try {
      const settings = await prisma.catalogSettings.upsert({
        where: { storeId: session.storeId },
        update: updateWithSocial,
        create: createWithSocial,
      });
      return NextResponse.json(settings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Backward compat: if DB/client does not have social fields, save core fields.
      if (
        msg.includes('Unknown field') ||
        msg.includes('facebookUrl') ||
        msg.includes('instagramUrl') ||
        msg.includes('tiktokUrl')
      ) {
        const settings = await prisma.catalogSettings.upsert({
          where: { storeId: session.storeId },
          update: baseUpdate,
          create: { storeId: session.storeId, ...baseUpdate },
        });
        return NextResponse.json(settings);
      }

      throw err;
    }
  } catch (error) {
    console.error('Error updating catalog settings:', error);
    return NextResponse.json(
      { error: 'Error al guardar la configuracion' },
      { status: 500 },
    );
  }
}

