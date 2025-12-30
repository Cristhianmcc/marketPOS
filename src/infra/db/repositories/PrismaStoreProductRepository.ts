import { StoreProduct } from '@/domain/types';
import { IStoreProductRepository } from '@/repositories/IStoreProductRepository';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PrismaStoreProductRepository implements IStoreProductRepository {
  async findById(id: string): Promise<StoreProduct | null> {
    const sp = await prisma.storeProduct.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!sp) return null;

    return {
      id: sp.id,
      storeId: sp.storeId,
      productId: sp.productId,
      price: sp.price.toNumber(),
      stock: sp.stock !== null ? sp.stock.toNumber() : null,
      minStock: sp.minStock !== null ? sp.minStock.toNumber() : null,
      active: sp.active,
      product: {
        id: sp.product.id,
        barcode: sp.product.barcode,
        internalSku: sp.product.internalSku,
        name: sp.product.name,
        brand: sp.product.brand,
        content: sp.product.content,
        category: sp.product.category,
        unitType: sp.product.unitType as 'UNIT' | 'KG',
        imageUrl: sp.product.imageUrl,
        isGlobal: sp.product.isGlobal, // ✅ MÓDULO 18.1
      },
    };
  }

  async findByStoreId(
    storeId: string,
    filters?: {
      query?: string;
      category?: string;
      lowStock?: boolean;
      active?: boolean;
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

    const storeProducts = await prisma.storeProduct.findMany({
      where,
      include: { product: true },
      orderBy: { product: { name: 'asc' } },
    });

    let results = storeProducts.map((sp: any) => ({
      id: sp.id,
      storeId: sp.storeId,
      productId: sp.productId,
      price: sp.price.toNumber(),
      stock: sp.stock !== null ? sp.stock.toNumber() : null,
      minStock: sp.minStock !== null ? sp.minStock.toNumber() : null,
      active: sp.active,
      product: {
        id: sp.product.id,
        barcode: sp.product.barcode,
        internalSku: sp.product.internalSku,
        name: sp.product.name,
        brand: sp.product.brand,
        content: sp.product.content,
        category: sp.product.category,
        unitType: sp.product.unitType as 'UNIT' | 'KG',
        imageUrl: sp.product.imageUrl,
        isGlobal: sp.product.isGlobal, // ✅ MÓDULO 18.1
      },
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
      include: { product: true },
    });

    if (!sp) return null;

    return {
      id: sp.id,
      storeId: sp.storeId,
      productId: sp.productId,
      price: sp.price.toNumber(),
      stock: sp.stock !== null ? sp.stock.toNumber() : null,
      minStock: sp.minStock !== null ? sp.minStock.toNumber() : null,
      active: sp.active,
      product: {
        id: sp.product.id,
        barcode: sp.product.barcode,
        internalSku: sp.product.internalSku,
        name: sp.product.name,
        brand: sp.product.brand,
        content: sp.product.content,
        category: sp.product.category,
        unitType: sp.product.unitType as 'UNIT' | 'KG',
        imageUrl: sp.product.imageUrl,
        isGlobal: sp.product.isGlobal, // ✅ MÓDULO 18.1
      },
    };
  }

  async create(storeProduct: Omit<StoreProduct, 'id'>): Promise<StoreProduct> {
    const created = await prisma.storeProduct.create({
      data: {
        storeId: storeProduct.storeId,
        productId: storeProduct.productId,
        price: storeProduct.price,
        stock: storeProduct.stock,
        minStock: storeProduct.minStock,
        active: storeProduct.active,
      },
      include: { product: true },
    });

    return {
      id: created.id,
      storeId: created.storeId,
      productId: created.productId,
      price: created.price.toNumber(),
      stock: created.stock?.toNumber() || null,
      minStock: created.minStock?.toNumber() || null,
      active: created.active,
      product: {
        id: created.product.id,
        barcode: created.product.barcode,
        internalSku: created.product.internalSku,
        name: created.product.name,
        brand: created.product.brand,
        content: created.product.content,
        category: created.product.category,
        unitType: created.product.unitType as 'UNIT' | 'KG',
        imageUrl: created.product.imageUrl,
        isGlobal: created.product.isGlobal,
      },
    };
  }

  async updatePrice(id: string, price: number): Promise<StoreProduct> {
    const updated = await prisma.storeProduct.update({
      where: { id },
      data: { price },
      include: { product: true },
    });

    return {
      id: updated.id,
      storeId: updated.storeId,
      productId: updated.productId,
      price: updated.price.toNumber(),
      stock: updated.stock?.toNumber() || null,
      minStock: updated.minStock?.toNumber() || null,
      active: updated.active,
      product: {
        id: updated.product.id,
        barcode: updated.product.barcode,
        internalSku: updated.product.internalSku,
        name: updated.product.name,
        brand: updated.product.brand,
        content: updated.product.content,
        category: updated.product.category,
        unitType: updated.product.unitType as 'UNIT' | 'KG',
        imageUrl: updated.product.imageUrl,
        isGlobal: updated.product.isGlobal,
      },
    };
  }

  async updateStock(id: string, stock: number): Promise<StoreProduct> {
    const updated = await prisma.storeProduct.update({
      where: { id },
      data: { stock },
      include: { product: true },
    });

    return {
      id: updated.id,
      storeId: updated.storeId,
      productId: updated.productId,
      price: updated.price.toNumber(),
      stock: updated.stock?.toNumber() || null,
      minStock: updated.minStock?.toNumber() || null,
      active: updated.active,
      product: {
        id: updated.product.id,
        barcode: updated.product.barcode,
        internalSku: updated.product.internalSku,
        name: updated.product.name,
        brand: updated.product.brand,
        content: updated.product.content,
        category: updated.product.category,
        unitType: updated.product.unitType as 'UNIT' | 'KG',
        imageUrl: updated.product.imageUrl,
        isGlobal: updated.product.isGlobal,
      },
    };
  }

  async updateActive(id: string, active: boolean): Promise<StoreProduct> {
    const updated = await prisma.storeProduct.update({
      where: { id },
      data: { active },
      include: { product: true },
    });

    return {
      id: updated.id,
      storeId: updated.storeId,
      productId: updated.productId,
      price: updated.price.toNumber(),
      stock: updated.stock?.toNumber() || null,
      minStock: updated.minStock?.toNumber() || null,
      active: updated.active,
      product: {
        id: updated.product.id,
        barcode: updated.product.barcode,
        internalSku: updated.product.internalSku,
        name: updated.product.name,
        brand: updated.product.brand,
        content: updated.product.content,
        category: updated.product.category,
        unitType: updated.product.unitType as 'UNIT' | 'KG',
        imageUrl: updated.product.imageUrl,
        isGlobal: updated.product.isGlobal,
      },
    };
  }
}
