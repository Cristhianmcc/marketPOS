import { Product, StoreProduct } from '@/domain/types';

export interface IStoreProductRepository {
  findById(id: string): Promise<StoreProduct | null>;
  findByStoreId(storeId: string, filters?: {
    query?: string;
    category?: string;
    lowStock?: boolean;
    active?: boolean;
  }): Promise<StoreProduct[]>;
  findByStoreAndProduct(storeId: string, productId: string): Promise<StoreProduct | null>;
  create(storeProduct: Omit<StoreProduct, 'id'>): Promise<StoreProduct>;
  updatePrice(id: string, price: number): Promise<StoreProduct>;
  updateStock(id: string, stock: number): Promise<StoreProduct>;
  updateActive(id: string, active: boolean): Promise<StoreProduct>;
}
