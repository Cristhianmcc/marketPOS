import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createFerreteria() {
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Verificar si ya existe
  const existing = await prisma.user.findUnique({
    where: { email: 'admin@ferreter.com' },
  });

  if (existing) {
    console.log('✅ Usuario ya existe:', existing.email);
    await prisma.$disconnect();
    return;
  }

  // Crear tienda de ferretería
  const store = await prisma.store.create({
    data: {
      name: 'Ferretería Central',
      ruc: '20987654321',
      address: 'Jr. Los Herreros 456, Lima',
      phone: '912345678',
    },
  });
  console.log('✅ Store created:', store.id, store.name);

  // Crear usuario admin
  const admin = await prisma.user.create({
    data: {
      storeId: store.id,
      email: 'admin@ferreter.com',
      name: 'Admin Ferretería',
      password: hashedPassword,
      role: 'OWNER',
    },
  });
  console.log('✅ User created:', admin.email);

  // Crear settings
  await prisma.storeSettings.create({
    data: {
      storeId: store.id,
      taxRate: 18,
      onboardingStep: 5,
      onboardingCompletedAt: new Date(),
    },
  });
  console.log('✅ Settings created');

  await prisma.$disconnect();
}

createFerreteria().catch(console.error);
