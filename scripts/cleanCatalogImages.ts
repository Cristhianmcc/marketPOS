// scripts/cleanCatalogImages.ts
// Limpiar imageUrl incorrectas del catálogo global

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanImages() {
  console.log('🧹 Limpiando imageUrl incorrectas del catálogo global...');

  const result = await prisma.productMaster.updateMany({
    where: {
      isGlobal: true,
      imageUrl: { not: null },
    },
    data: {
      imageUrl: null,
    },
  });

  console.log(`✅ ${result.count} productos actualizados (imageUrl eliminada)`);
  await prisma.$disconnect();
}

cleanImages().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
