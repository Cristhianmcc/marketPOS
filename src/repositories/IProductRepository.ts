import { Product } from '@/domain/types';

export interface ProductRepository {
  findByBarcode(barcode: string): Promise<Product | null>;
  findByInternalSku(sku: string): Promise<Product | null>;
  search(query: string, limit?: number): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  create(product: Omit<Product, 'id'>): Promise<Product>;
}
