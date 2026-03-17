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

      // Backward compat: tabla o columnas faltantes en BD desktop antigua.
      const isMissingColumn =
        msg.includes('Unknown field') ||
        msg.includes('facebookUrl') ||
        msg.includes('instagramUrl') ||
        msg.includes('tiktokUrl') ||
        msg.includes('facebook_url') ||
        msg.includes('instagram_url') ||
        msg.includes('tiktok_url') ||
        msg.includes('does not exist');

      const isMissingTable =
        msg.includes('does not exist in the current database') ||
        msg.includes("doesn't exist") ||
        msg.includes('P2021') ||
        msg.includes('catalog_settings') ||
        msg.includes('no such table');

      if (isMissingTable) {
        // La tabla aún no existe en esta BD → devolver defaults vacíos
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
      } else if (isMissingColumn) {
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

    // Verificar slug único (puede fallar si la tabla no existe en BD desktop)
    try {
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
    } catch {
      // Tabla no existe en BD desktop — continuar sin validar slug
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

    // Intentar guardar con todos los campos. Si falla, ir reduciendo.
    const fullData = {
      enabled: !!enabled,
      storeSlug: slug || null,
      whatsappNumber: whatsappNumber || '',
      storeLogoPath: storeLogoPath || null,
      storeBannerPath: storeBannerPath || null,
      catalogUrl: enabled ? computedCatalogUrl : null,
      catalogStatus: enabled ? 'PUBLISHED' : 'DRAFT',
      facebookUrl: facebookUrl || null,
      instagramUrl: instagramUrl || null,
      tiktokUrl: tiktokUrl || null,
    };

    // Respuesta que devolvemos si nada funciona (BD sin tabla)
    const fallbackResponse = {
      enabled: !!enabled,
      slug: slug || '',
      whatsappNumber: whatsappNumber || '',
      storeLogoPath: storeLogoPath || '',
      storeBannerPath: storeBannerPath || '',
      facebookUrl: facebookUrl || '',
      instagramUrl: instagramUrl || '',
      tiktokUrl: tiktokUrl || '',
      catalogUrl: computedCatalogUrl || '',
    };

    try {
      // Intento 1: todos los campos
      const settings = await prisma.catalogSettings.upsert({
        where: { storeId: session.storeId },
        update: fullData,
        create: { storeId: session.storeId, ...fullData },
      });
      return NextResponse.json(settings);
    } catch {
      try {
        // Intento 2: sin redes sociales
        const { facebookUrl: _f, instagramUrl: _i, tiktokUrl: _t, ...withoutSocial } = fullData;
        const settings = await prisma.catalogSettings.upsert({
          where: { storeId: session.storeId },
          update: withoutSocial,
          create: { storeId: session.storeId, ...withoutSocial },
        });
        return NextResponse.json(settings);
      } catch {
        try {
          // Intento 3: campos mínimos (sin catalogUrl/catalogStatus/social)
          const minimal = {
            enabled: !!enabled,
            storeSlug: slug || null,
            whatsappNumber: whatsappNumber || '',
            storeLogoPath: storeLogoPath || null,
            storeBannerPath: storeBannerPath || null,
          };
          const settings = await prisma.catalogSettings.upsert({
            where: { storeId: session.storeId },
            update: minimal,
            create: { storeId: session.storeId, ...minimal },
          });
          return NextResponse.json(settings);
        } catch {
          // Tabla no existe — devolver datos sin persistir
          return NextResponse.json(fallbackResponse);
        }
      }
    }
  } catch (error) {
    console.error('Error updating catalog settings:', error);
    return NextResponse.json(
      { error: 'Error al guardar la configuracion' },
      { status: 500 },
    );
  }
}

