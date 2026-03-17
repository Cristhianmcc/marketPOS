import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Buscando CatalogSettings...\n');
  
  const settings = await prisma.catalogSettings.findMany({
    select: {
      id: true,
      storeId: true,
      enabled: true,
      storeSlug: true,
      storeName: true,
      catalogStatus: true,
      whatsappNumber: true,
      storeLogoPath: true,
      storeBannerPath: true,
      createdAt: true,
      updatedAt: true,
    }
  });

  if (settings.length === 0) {
    console.log('❌ No se encontraron CatalogSettings');
  } else {
    console.log(`✅ Se encontraron ${settings.length} catalogos:\n`);
    settings.forEach((s, i) => {
      console.log(`${i + 1}. Store ID: ${s.storeId}`);
      console.log(`   Slug: ${s.storeSlug || '(vacío)'}`);
      console.log(`   Nombre: ${s.storeName || '(vacío)'}`);
      console.log(`   Habilitado: ${s.enabled}`);
      console.log(`   Estado: ${s.catalogStatus}`);
      console.log(`   WhatsApp: ${s.whatsappNumber || '(vacío)'}`);
      console.log(`   Logo: ${s.storeLogoPath ? '✓' : '✗'}`);
      console.log(`   Banner: ${s.storeBannerPath ? '✓' : '✗'}`);
      console.log(`   Actualizado: ${s.updatedAt.toISOString()}\n`);
    });
  }

  // También revisar los productos
  console.log('\n🔍 Buscando productos publicados en catálogo...\n');
  
  const products = await prisma.storeProduct.findMany({
    where: {
      catalogVisible: true,
    },
    select: {
      id: true,
      storeId: true,
      catalogTitle: true,
      catalogCategory: true,
      catalogImagePath: true,
      catalogVisible: true,
    },
    take: 5
  });

  if (products.length === 0) {
    console.log('❌ No se encontraron productos en catálogo');
  } else {
    console.log(`✅ Se encontraron ${products.length} productos (mostrando primeros 5):\n`);
    products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.catalogTitle} (${p.storeId})`);
      console.log(`   Categoría: ${p.catalogCategory || '(vacía)'}`);
      console.log(`   Visible: ${p.catalogVisible}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
