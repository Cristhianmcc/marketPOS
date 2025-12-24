import { Movement } from '@/domain/types';

export interface IMovementRepository {
  create(movement: Omit<Movement, 'id' | 'createdAt'>): Promise<Movement>;
  findByStoreProductId(storeProductId: string, limit?: number): Promise<Movement[]>;
  findByStoreId(storeId: string, limit?: number): Promise<Movement[]>;
}
