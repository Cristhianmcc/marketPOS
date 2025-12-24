// Repository interface for User operations

import { User } from '@/domain/types';

export interface IUserRepository {
  findByEmail(email: string): Promise<User & { password: string } | null>;
  findById(id: string): Promise<User | null>;
}
