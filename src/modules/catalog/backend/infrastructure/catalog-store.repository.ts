import type { Prisma, PrismaClient } from '@prisma/client';

type DBClient = PrismaClient | Prisma.TransactionClient;

export class CatalogStoreRepository {
  constructor(private readonly db: DBClient) {}

  async getPublishedBySlug(slug: string) {
    try {
      return await this.db.catalogSettings.findFirst({
        where: {
          storeSlug: slug,
          catalogStatus: 'PUBLISHED',
          enabled: true,
        },
        select: {
          storeId: true,
          storeName: true,
          storeSlug: true,
          whatsappNumber: true,
          storeLogoPath: true,
          storeBannerPath: true,
          facebookUrl: true,
          instagramUrl: true,
          tiktokUrl: true,
          catalogUrl: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Backward-compat: if the DB/client doesn't have these columns yet, avoid breaking the public catalog.
      if (
        msg.includes('Unknown field') ||
        msg.includes('facebookUrl') ||
        msg.includes('instagramUrl') ||
        msg.includes('tiktokUrl')
      ) {
        return this.db.catalogSettings.findFirst({
          where: {
            storeSlug: slug,
            catalogStatus: 'PUBLISHED',
            enabled: true,
          },
          select: {
            storeId: true,
            storeName: true,
            storeSlug: true,
            whatsappNumber: true,
            storeLogoPath: true,
            storeBannerPath: true,
            catalogUrl: true,
            updatedAt: true,
          },
        });
      }

      throw err;
    }
  }

  async upsertPublished(input: {
    storeId: string;
    storeName: string;
    slug: string;
    whatsappNumber: string;
    logoUrl: string | null;
    bannerUrl: string | null;
    catalogUrl: string;
  }): Promise<void> {
    const now = new Date();

    await this.db.catalogSettings.upsert({
      where: { storeId: input.storeId },
      create: {
        storeId: input.storeId,
        enabled: true,
        storeName: input.storeName,
        storeSlug: input.slug,
        storeLogoPath: input.logoUrl,
        storeBannerPath: input.bannerUrl,
        whatsappNumber: input.whatsappNumber,
        catalogStatus: 'PUBLISHED',
        catalogUrl: input.catalogUrl,
        lastPublishedAt: now,
        lastSyncAt: now,
        syncMode: 'manual',
      },
      update: {
        enabled: true,
        storeName: input.storeName,
        storeSlug: input.slug,
        storeLogoPath: input.logoUrl,
        storeBannerPath: input.bannerUrl,
        whatsappNumber: input.whatsappNumber,
        catalogStatus: 'PUBLISHED',
        catalogUrl: input.catalogUrl,
        lastPublishedAt: now,
        lastSyncAt: now,
      },
    });
  }

  async setDisabled(storeId: string): Promise<void> {
    await this.db.catalogSettings.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: false,
        storeName: '',
        whatsappNumber: '',
        catalogStatus: 'DISABLED',
        syncMode: 'manual',
      },
      update: {
        enabled: false,
        catalogStatus: 'DISABLED',
        catalogUrl: null,
        lastSyncAt: new Date(),
      },
    });
  }
}
