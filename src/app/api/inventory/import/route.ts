import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { ProductRepository } from '@/repositories/IProductRepository';
import { PrismaProductRepository } from '@/infra/db/repositories/PrismaProductRepository';
import { IStoreProductRepository } from '@/repositories/IStoreProductRepository';
import { PrismaStoreProductRepository } from '@/infra/db/repositories/PrismaStoreProductRepository';
import { IMovementRepository } from '@/repositories/IMovementRepository';
import { PrismaMovementRepository } from '@/infra/db/repositories/PrismaMovementRepository';
import { nanoid } from 'nanoid';

interface CSVRow {
  name: string;
  category: string;
  barcode?: string;
  brand?: string;
  content?: string;
  unitType: 'UNIT' | 'KG';
  price: number;
  stock?: number;
  minStock?: number;
}

interface ImportBody {
  newProducts: CSVRow[];
  existingProducts: CSVRow[];
  updateExisting: {
    price: boolean;
    stock: boolean;
  };
}

const productRepo: ProductRepository = new PrismaProductRepository();
const storeProductRepo: IStoreProductRepository = new PrismaStoreProductRepository();
const movementRepo: IMovementRepository = new PrismaMovementRepository();

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ImportBody = await req.json();
    const { newProducts, existingProducts, updateExisting } = body;

    let created = 0;
    let updated = 0;

    // Process new products
    for (const row of newProducts) {
      try {
        // Create product in master catalog
        const product = await productRepo.create({
          name: row.name,
          brand: row.brand || null,
          category: row.category,
          content: row.content || null,
          barcode: row.barcode || null,
          internalSku: `SKU-${nanoid(10)}`,
          unitType: row.unitType,
          imageUrl: null,
        });

        // Configure for user's store
        await storeProductRepo.create({
          productId: product.id,
          storeId: session.storeId,
          price: row.price,
          stock: row.stock !== undefined ? row.stock : null,
          minStock: row.minStock !== undefined ? row.minStock : null,
          active: true,
        });

        // Create initial movement if stock provided
        if (row.stock !== undefined && row.stock > 0) {
          const storeProduct = await storeProductRepo.findByStoreAndProduct(
            session.storeId,
            product.id
          );

          if (storeProduct) {
            await movementRepo.create({
              storeId: session.storeId,
              storeProductId: storeProduct.id,
              type: 'PURCHASE',
              quantity: row.stock,
              unitPrice: row.price,
              total: row.stock * row.price,
              notes: 'Importación CSV - Stock inicial',
              createdById: session.userId,
            });
          }
        }

        created++;
      } catch (error) {
        console.error('Error creating product:', error);
      }
    }

    // Process existing products
    if (existingProducts.length > 0) {
      for (const row of existingProducts) {
        try {
          // Find product by barcode
          const existingProduct = await productRepo.findByBarcode(row.barcode!);
          if (!existingProduct) continue;

          // Check if already configured for this store
          const storeProduct = await storeProductRepo.findByStoreAndProduct(
            session.storeId,
            existingProduct.id
          );

          if (!storeProduct) {
            // Configure for store if not exists
            await storeProductRepo.create({
              productId: existingProduct.id,
              storeId: session.storeId,
              price: row.price,
              stock: row.stock !== undefined ? row.stock : null,
              minStock: row.minStock !== undefined ? row.minStock : null,
              active: true,
            });

            // Create initial movement if stock provided
            if (row.stock !== undefined && row.stock > 0) {
              const newStoreProduct = await storeProductRepo.findByStoreAndProduct(
                session.storeId,
                existingProduct.id
              );

              if (newStoreProduct) {
                await movementRepo.create({
                  storeId: session.storeId,
                  storeProductId: newStoreProduct.id,
                  type: 'PURCHASE',
                  quantity: row.stock,
                  unitPrice: row.price,
                  total: row.stock * row.price,
                  notes: 'Importación CSV - Stock inicial',
                  createdById: session.userId,
                });
              }
            }

            updated++;
          } else {
            // Update existing store product if options selected
            let hasUpdate = false;

            if (updateExisting.price) {
              await storeProductRepo.updatePrice(storeProduct.id, row.price);
              hasUpdate = true;
            }

            if (updateExisting.stock && row.stock !== undefined) {
              const currentStock = storeProduct.stock || 0;
              const newStock = row.stock;
              const diff = newStock - currentStock;

              if (diff !== 0) {
                await storeProductRepo.updateStock(storeProduct.id, newStock);

                // Create adjustment movement
                await movementRepo.create({
                  storeId: session.storeId,
                  storeProductId: storeProduct.id,
                  type: 'ADJUSTMENT',
                  quantity: diff,
                  unitPrice: 0,
                  total: 0,
                  notes: `Importación CSV - Ajuste de stock (${currentStock} → ${newStock})`,
                  createdById: session.userId,
                });

                hasUpdate = true;
              }
            }

            if (hasUpdate) updated++;
          }
        } catch (error) {
          console.error('Error updating product:', error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
