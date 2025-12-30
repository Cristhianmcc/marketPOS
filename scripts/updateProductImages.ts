// scripts/updateProductImages.ts
// ✅ MÓDULO 18.2: Script para actualizar imágenes de productos masivamente

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * Script para actualizar imágenes de productos existentes en el catálogo global
 * 
 * Uso:
 * 1. Crear archivo JSON con este formato:
 *    [
 *      { "name": "Inca Kola 1L", "imageUrl": "https://..." },
 *      { "name": "Coca Cola 500ml", "imageUrl": "https://..." }
 *    ]
 * 2. Ejecutar: tsx scripts/updateProductImages.ts <archivo.json>
 */

interface ImageUpdate {
  name: string;
  brand?: string;
  imageUrl: string;
}

async function updateImages(filePath: string) {
  console.log("🖼️  Iniciando actualización de imágenes...");

  if (!fs.existsSync(filePath)) {
    console.error(`❌ No se encontró el archivo: ${filePath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(filePath, "utf-8");
  const updates: ImageUpdate[] = JSON.parse(rawData);

  console.log(`📦 ${updates.length} productos a actualizar`);

  let updated = 0;
  let notFound = 0;
  let skipped = 0;

  for (const item of updates) {
    try {
      // Buscar producto por nombre (y opcionalmente brand)
      const where: any = {
        name: {
          equals: item.name,
          mode: "insensitive" as const,
        },
      };

      if (item.brand) {
        where.brand = {
          equals: item.brand,
          mode: "insensitive" as const,
        };
      }

      const products = await prisma.productMaster.findMany({
        where,
        take: 1,
      });

      if (products.length === 0) {
        console.log(`⚠️  Producto no encontrado: ${item.name}`);
        notFound++;
        continue;
      }

      const product = products[0];

      // Actualizar solo si no tiene imagen o si queremos sobrescribir
      if (product.imageUrl && product.imageUrl !== item.imageUrl) {
        console.log(`⏭️  Producto ya tiene imagen: ${item.name}`);
        skipped++;
        continue;
      }

      await prisma.productMaster.update({
        where: { id: product.id },
        data: { imageUrl: item.imageUrl },
      });

      console.log(`✅ Actualizado: ${item.name}`);
      updated++;
    } catch (error) {
      console.error(`❌ Error actualizando "${item.name}":`, error);
    }
  }

  console.log("\n✅ Actualización completada:");
  console.log(`   - Actualizados: ${updated}`);
  console.log(`   - No encontrados: ${notFound}`);
  console.log(`   - Omitidos (ya tienen imagen): ${skipped}`);
}

// Ejecutar
const filePath = process.argv[2];

if (!filePath) {
  console.error("❌ Uso: tsx scripts/updateProductImages.ts <archivo.json>");
  console.log("\nEjemplo:");
  console.log("  tsx scripts/updateProductImages.ts data/product_images.json");
  process.exit(1);
}

const fullPath = path.isAbsolute(filePath) 
  ? filePath 
  : path.join(process.cwd(), filePath);

updateImages(fullPath)
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
