import { z } from 'zod';

export const CatalogPublishPayloadSchema = z.object({
  storeId: z.string().min(1),
  storeName: z.string().min(1),
  slug: z.string().min(1),
  whatsappNumber: z.string(),
  logoUrl: z.string().url().nullable(),
  bannerUrl: z.string().url().nullable(),
  // Opcional: un instalador antiguo no la envía y se conserva la de la tienda
  palette: z.string().max(40).optional(),
  products: z.array(
    z.object({
      localProductId: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      price: z.number().min(0),
      category: z.string(),
      imageUrl: z.string().nullable(),
      visible: z.boolean(),
      updatedAt: z.string().nullable(),
      // Perfumería: se sanea en el repositorio (sanitizePerfumeAttributes).
      attributes: z.unknown().optional(),
    }),
  ).min(1),
});

export const CatalogUnpublishPayloadSchema = z.object({
  storeId: z.string().min(1),
});
