// Concrete implementation for Prisma/Postgres

import { IUserRepository } from '@/repositories/IUserRepository';
import { User } from '@/domain/types';
import { prisma } from '../prisma';

export class PrismaUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<(User & { password: string }) | null> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.active) {
      return null;
    }

    return {
      id: user.id,
      storeId: user.storeId,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      password: user.password,
    };
  }

  async findById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user || !user.active) {
      return null;
    }

    return {
      id: user.id,
      storeId: user.storeId,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
    };
  }
}
