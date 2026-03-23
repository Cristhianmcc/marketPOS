import { StoreProduct } from '@/domain/types';
import { IStoreProductRepository } from '@/repositories/IStoreProductRepository';
import { prisma } from '../prisma';

function mapProduct(p: any) {
  return {
    id: p.id,
    barcode: p.barcode,
    internalSku: p.internalSku,
    name: p.name,
    brand: p.brand,
    content: p.content,
    category: p.category,
    unitType: p.unitType as 'UNIT' | 'KG',
    baseUnitId: p.baseUnitId,
    baseUnitDisplay: p.baseUnit?.symbol || p.baseUnit?.displayName || null,
    imageUrl: p.imageUrl,
    isGlobal: p.isGlobal,
  };
}

const PRODUCT_SELECT = {
  id: true,
  barcode: true,
  internalSku: true,
  name: true,
  brand: true,
  content: true,
  category: true,
  unitType: true,
  baseUnitId: true,
  baseUnit: { select: { symbol: true, displayName: true } },
  imageUrl: true,
  isGlobal: true,
} as const;

const STORE_PRODUCT_SELECT = {
  id: true,
  storeId: true,
  productId: true,
  price: true,
  costPrice: true,
  stock: true,
  minStock: true,
  active: true,
  product: { select: PRODUCT_SELECT },
} as const;

export class PrismaStoreProductRepository implements IStoreProductRepository {
  async findById(id: string): Promise<StoreProduct | null> {
    const sp = await prisma.storeProduct.findUnique({
      where: { id },
      select: STORE_PRODUCT_SELECT,
    });

    if (!sp) return null;

    return {
      id: sp.id,
      storeId: sp.storeId,
      productId: sp.productId,
      price: sp.price.toNumber(),
      costPrice: sp.costPrice !== null ? sp.costPrice.toNumber() : null,
      stock: sp.stock !== null ? sp.stock.toNumber() : null,
      minStock: sp.minStock !== null ? sp.minStock.toNumber() : null,
      active: sp.active,
      publishInCatalog: (sp as any).publishInCatalog ?? false,
      product: mapProduct(sp.product),
    };
  }

  async findByStoreId(
    storeId: string,
    filters?: {
      query?: string;
      category?: string;
      lowStock?: boolean;
      active?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<StoreProduct[]> {
    const where: any = { storeId };

    if (filters?.active !== undefined) {
      where.active = filters.active;
    }

    if (filters?.query) {
      where.OR = [
        { product: { name: { contains: filters.query, mode: 'insensitive' } } },
        { product: { barcode: { contains: filters.query } } },
        { product: { internalSku: { contains: filters.query } } },
      ];
    }

    if (filters?.category) {
      where.product = { ...where.product, category: filters.category };
    }

    const take = filters?.query ? 20 : (filters?.limit ?? undefined);
    const skip = filters?.offset ?? undefined;

    const storeProducts = await prisma.storeProduct.findMany({
      where,
      select: STORE_PRODUCT_SELECT,
      orderBy: { product: { name: 'asc' } },
      take,
      skip,
    });

    let results = storeProducts.map((sp: any) => ({
      id: sp.id,
      storeId: sp.storeId,
      productId: sp.productId,
      price: sp.price.toNumber(),
      costPrice: sp.costPrice !== null ? sp.costPrice.toNumber() : null,
      stock: sp.stock !== null ? sp.stock.toNumber() : null,
      minStock: sp.minStock !== null ? sp.minStock.toNumber() : null,
      active: sp.active,
      publishInCatalog: (sp as any).publishInCatalog ?? false,
      product: mapProduct(sp.product),
    }));

    // Filter low stock client-side (UNIT only and stock <= minStock)
    if (filters?.lowStock) {
      results = results.filter(
        (sp) =>
          sp.product.unitType === 'UNIT' &&
          sp.stock !== null &&
          sp.minStock !== null &&
          sp.stock <= sp.minStock
      );
    }

    return results;
  }

  async findByStoreAndProduct(storeId: string, productId: string): Promise<StoreProduct | null> {
    const sp = await prisma.storeProduct.findFirst({
      where: { storeId, productId },
      select: STORE_PRODUCT_SELECT,
    });

    if (!sp) return null;

    return {
      id: sp.id,
      storeId: sp.storeId,
      productId: sp.productId,
      price: sp.price.toNumber(),
      costPrice: sp.costPrice !== null ? sp.costPrice.toNumber() : null,
      stock: sp.stock !== null ? sp.stock.toNumber() : null,
      minStock: sp.minStock !== null ? sp.minStock.toNumber() : null,
      active: sp.active,
      publishInCatalog: (sp as any).publishInCatalog ?? false,
      product: mapProduct(sp.product),
    };
  }

  async countByStoreId(
    storeId: string,
    filters?: { query?: string; category?: string; lowStock?: boolean; active?: boolean }
  ): Promise<number> {
    const where: any = { storeId };
    if (filters?.active !== undefined) where.active = filters.active;
    if (filters?.query) {
      where.OR = [
        { product: { name: { contains: filters.query, mode: 'insensitive' } } },
        { product: { barcode: { contains: filters.query } } },
        { product: { internalSku: { contains: filters.query } } },
      ];
    }
    if (filters?.category) {
      where.product = { ...where.product, category: filters.category };
    }
    return prisma.storeProduct.count({ where });
  }

  async create(storeProduct: Omit<StoreProduct, 'id'>): Promise<StoreProduct> {
    const created = await prisma.storeProduct.create({
      data: {
        storeId: storeProduct.storeId,
        productId: storeProduct.productId,
        price: storeProduct.price,
        costPrice: storeProduct.costPrice ?? null,
        stock: storeProduct.stock,
        minStock: storeProduct.minStock,
        active: storeProduct.active,
      },
      select: STORE_PRODUCT_SELECT,
    });

    return {
      id: created.id,
      storeId: created.storeId,
      productId: created.productId,
      price: created.price.toNumber(),
      costPrice: created.costPrice?.toNumber() ?? null,
      stock: created.stock?.toNumber() || null,
      minStock: created.minStock?.toNumber() || null,
      active: created.active,
      publishInCatalog: (created as any).publishInCatalog ?? false,
      product: mapProduct(created.product),
    };
  }

  async updatePrice(id: string, price: number): Promise<StoreProduct> {
    const updated = await prisma.storeProduct.update({
      where: { id },
      data: { price },
      select: STORE_PRODUCT_SELECT,
    });

    return {
      id: updated.id,
      storeId: updated.storeId,
      productId: updated.productId,
      price: updated.price.toNumber(),
      costPrice: updated.costPrice?.toNumber() ?? null,
      stock: updated.stock?.toNumber() || null,
      minStock: updated.minStock?.toNumber() || null,
      active: updated.active,
      publishInCatalog: (updated as any).publishInCatalog ?? false,
      product: mapProduct(updated.product),
    };
  }

  async updateStock(id: string, stock: number): Promise<StoreProduct> {
    const updated = await prisma.storeProduct.update({
      where: { id },
      data: { stock },
      select: STORE_PRODUCT_SELECT,
    });

    return {
      id: updated.id,
      storeId: updated.storeId,
      productId: updated.productId,
      price: updated.price.toNumber(),
      costPrice: updated.costPrice?.toNumber() ?? null,
      stock: updated.stock?.toNumber() || null,
      minStock: updated.minStock?.toNumber() || null,
      active: updated.active,
      publishInCatalog: (updated as any).publishInCatalog ?? false,
      product: mapProduct(updated.product),
    };
  }

  async updateActive(id: string, active: boolean): Promise<StoreProduct> {
    const updated = await prisma.storeProduct.update({
      where: { id },
      data: { active },
      select: STORE_PRODUCT_SELECT,
    });

    return {
      id: updated.id,
      storeId: updated.storeId,
      productId: updated.productId,
      price: updated.price.toNumber(),
      costPrice: updated.costPrice?.toNumber() ?? null,
      stock: updated.stock?.toNumber() || null,
      minStock: updated.minStock?.toNumber() || null,
      active: updated.active,
      publishInCatalog: (updated as any).publishInCatalog ?? false,
      product: mapProduct(updated.product),
    };
  }
}
