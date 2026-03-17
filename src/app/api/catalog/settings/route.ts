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
      // Backward-compat: old desktop DBs may not yet have social columns.
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
            messageTemplate: true,
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
      // Default initial settings (keep fields expected by the UI)
      return NextResponse.json({
        enabled: false,
        slug: '',
        whatsappNumber: '',
        facebookUrl: '',
        instagramUrl: '',
        tiktokUrl: '',
        messageTemplate:
          'Hola, me gustaría hacer un pedido:\n\n*Productos:*\n{items}\n\n*Total: {total}*',
        storeLogoPath: '',
        storeBannerPath: '',
      });
    }

    // Remap for the frontend (storeSlug -> slug)
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

    // Basic validation
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: 'Slug inválido (solo letras minúsculas, números y guiones)' },
        { status: 400 },
      );
    }

    // Check slug uniqueness
    if (slug) {
      const existing = await prisma.catalogSettings.findFirst({
        where: {
          storeSlug: slug,
          NOT: { storeId: session.storeId },
        },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Este slug ya está en uso por otra tienda' },
          { status: 400 },
        );
      }
    }

    const baseUpdate = {
      enabled: !!enabled,
      storeSlug: slug || null,
      whatsappNumber: whatsappNumber || '',
      storeLogoPath: storeLogoPath || null,
      storeBannerPath: storeBannerPath || null,
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

      // Backward-compat: allow saving without social fields if the DB/client isn't updated yet.
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
      { error: 'Error al guardar la configuración' },
      { status: 500 },
    );
  }
}
