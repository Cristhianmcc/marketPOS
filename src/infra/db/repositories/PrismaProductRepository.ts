import { ProductRepository } from '@/repositories/IProductRepository';
import { Product } from '@/domain/types';
import { prisma } from '../prisma';

export class PrismaProductRepository implements ProductRepository {
  async findByBarcode(barcode: string): Promise<Product | null> {
    const product = await prisma.productMaster.findUnique({
      where: { barcode },
    });

    if (!product) return null;

    return {
      id: product.id,
      barcode: product.barcode,
      internalSku: product.internalSku,
      name: product.name,
      brand: product.brand,
      content: product.content,
      category: product.category,
      unitType: product.unitType,
      imageUrl: product.imageUrl,
    };
  }

  async findByInternalSku(sku: string): Promise<Product | null> {
    const product = await prisma.productMaster.findUnique({
      where: { internalSku: sku },
    });

    if (!product) return null;

    return {
      id: product.id,
      barcode: product.barcode,
      internalSku: product.internalSku,
      name: product.name,
      brand: product.brand,
      content: product.content,
      category: product.category,
      unitType: product.unitType,
      imageUrl: product.imageUrl,
    };
  }

  async search(query: string, limit: number = 20): Promise<Product[]> {
    const products = await prisma.productMaster.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { barcode: { contains: query } },
              { internalSku: { contains: query } },
              { brand: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}, // Sin filtro si query está vacío
      take: limit,
      orderBy: { name: 'asc' },
    });

    return products.map((p) => ({
      id: p.id,
      barcode: p.barcode,
      internalSku: p.internalSku,
      name: p.name,
      brand: p.brand,
      content: p.content,
      category: p.category,
      unitType: p.unitType as 'UNIT' | 'KG',
      imageUrl: p.imageUrl,
    }));
  }

  async findById(id: string): Promise<Product | null> {
    const product = await prisma.productMaster.findUnique({
      where: { id },
    });

    if (!product) return null;

    return {
      id: product.id,
      barcode: product.barcode,
      internalSku: product.internalSku,
      name: product.name,
      brand: product.brand,
      content: product.content,
      category: product.category,
      unitType: product.unitType,
      imageUrl: product.imageUrl,
    };
  }

  async create(product: Omit<Product, 'id'>): Promise<Product> {
    const created = await prisma.productMaster.create({
      data: {
        barcode: product.barcode,
        internalSku: product.internalSku,
        name: product.name,
        brand: product.brand,
        content: product.content,
        category: product.category,
        unitType: product.unitType,
        imageUrl: product.imageUrl || null,
      },
    });

    return {
      id: created.id,
      barcode: created.barcode,
      internalSku: created.internalSku,
      name: created.name,
      brand: created.brand,
      content: created.content,
      category: created.category,
      unitType: created.unitType,
      imageUrl: created.imageUrl,
    };
  }
}
