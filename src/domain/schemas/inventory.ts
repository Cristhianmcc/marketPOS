import { z } from 'zod';

export const CreateProductSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  unitType: z.enum(['UNIT', 'KG']),
  category: z.string().default('Otros'),
  brand: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  barcode: z
    .string()
    .regex(/^\d{8,14}$/, 'Código de barras debe ser numérico de 8-14 dígitos')
    .optional()
    .nullable(),
  imageUrl: z.string().url('URL de imagen inválida').optional().nullable(),
});

export const ConfigureStoreProductSchema = z.object({
  productId: z.string().min(1, 'Product ID es requerido'),
  price: z.number().positive('Precio debe ser mayor a 0'),
  stock: z.number().nonnegative('Stock debe ser no negativo').optional().nullable(),
  minStock: z.number().nonnegative('Stock mínimo debe ser no negativo').optional().nullable(),
  active: z.boolean().default(true),
});

export const UpdatePriceSchema = z.object({
  price: z.number().positive('Precio debe ser mayor a 0'),
});

export const StockMovementSchema = z.object({
  type: z.enum(['PURCHASE', 'ADJUSTMENT']),
  quantity: z.number().refine((val) => val !== 0, 'Cantidad no puede ser 0'),
  unitPrice: z.number().positive().optional().nullable(),
  total: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});
