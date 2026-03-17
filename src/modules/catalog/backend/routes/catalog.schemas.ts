import { z } from 'zod';

export const CatalogPublishPayloadSchema = z.object({
  storeId: z.string().min(1),
  storeName: z.string().min(1),
  slug: z.string().min(1),
  whatsappNumber: z.string(),
  logoUrl: z.string().url().nullable(),
  bannerUrl: z.string().url().nullable(),
  products: z.array(
    z.object({
      localProductId: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      price: z.number().positive(),
      category: z.string(),
      imageUrl: z.string().nullable(),
      visible: z.boolean(),
      updatedAt: z.string().nullable(),
    }),
  ).min(1),
});

export const CatalogUnpublishPayloadSchema = z.object({
  storeId: z.string().min(1),
});
