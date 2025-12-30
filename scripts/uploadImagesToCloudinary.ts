// scripts/uploadImagesToCloudinary.ts
// ✅ MÓDULO 18.2: Script para subir imágenes locales a Cloudinary masivamente

import { PrismaClient } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Script para subir imágenes locales a Cloudinary y asignarlas a productos
 * 
 * Estructura de carpetas esperada:
 * /images/products/
 *   inca-kola-1l.jpg
 *   coca-cola-500ml.jpg
 *   ...
 * 
 * Y un archivo mapping JSON:
 * /images/products/mapping.json
 * [
 *   { "filename": "inca-kola-1l.jpg", "productName": "Inca Kola 1L" },
 *   { "filename": "coca-cola-500ml.jpg", "productName": "Coca Cola 500ml" }
 * ]
 * 
 * Uso:
 * tsx scripts/uploadImagesToCloudinary.ts <carpeta-imagenes>
 */

interface ImageMapping {
  filename: string;
  productName: string;
  brand?: string;
}

async function uploadImages(imagesDir: string) {
  console.log("☁️  Iniciando subida a Cloudinary...");

  if (!fs.existsSync(imagesDir)) {
    console.error(`❌ Carpeta no encontrada: ${imagesDir}`);
    process.exit(1);
  }

  // Verificar credenciales
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error("❌ CLOUDINARY_CLOUD_NAME no configurado en .env");
    process.exit(1);
  }

  // Leer mapping
  const mappingPath = path.join(imagesDir, "mapping.json");
  
  if (!fs.existsSync(mappingPath)) {
    console.error(`❌ No se encontró mapping.json en ${imagesDir}`);
    console.log("\nCrea un archivo mapping.json con este formato:");
    console.log(`[
  { "filename": "inca-kola-1l.jpg", "productName": "Inca Kola 1L" },
  { "filename": "coca-cola-500ml.jpg", "productName": "Coca Cola 500ml" }
]`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(mappingPath, "utf-8");
  const mappings: ImageMapping[] = JSON.parse(rawData);

  console.log(`📦 ${mappings.length} imágenes a procesar`);

  let uploaded = 0;
  let updated = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const imagePath = path.join(imagesDir, mapping.filename);

      if (!fs.existsSync(imagePath)) {
        console.log(`⚠️  Imagen no encontrada: ${mapping.filename}`);
        failed++;
        continue;
      }

      // Subir a Cloudinary
      console.log(`⬆️  Subiendo: ${mapping.filename}...`);
      
      const folder = process.env.CLOUDINARY_FOLDER || "productos";
      const uploadResult = await cloudinary.uploader.upload(imagePath, {
        folder: folder,
        use_filename: true,
        unique_filename: true,
      });

      console.log(`✅ Subido: ${uploadResult.secure_url}`);
      uploaded++;

      // Buscar producto y actualizar
      const where: any = {
        name: {
          equals: mapping.productName,
          mode: "insensitive" as const,
        },
      };

      if (mapping.brand) {
        where.brand = {
          equals: mapping.brand,
          mode: "insensitive" as const,
        };
      }

      const products = await prisma.productMaster.findMany({
        where,
        take: 1,
      });

      if (products.length === 0) {
        console.log(`⚠️  Producto no encontrado en DB: ${mapping.productName}`);
        continue;
      }

      const product = products[0];

      await prisma.productMaster.update({
        where: { id: product.id },
        data: { imageUrl: uploadResult.secure_url },
      });

      console.log(`✅ Producto actualizado: ${mapping.productName}`);
      updated++;
    } catch (error) {
      console.error(`❌ Error con "${mapping.filename}":`, error);
      failed++;
    }
  }

  console.log("\n✅ Proceso completado:");
  console.log(`   - Imágenes subidas: ${uploaded}`);
  console.log(`   - Productos actualizados: ${updated}`);
  console.log(`   - Errores: ${failed}`);
}

// Ejecutar
const imagesDir = process.argv[2];

if (!imagesDir) {
  console.error("❌ Uso: tsx scripts/uploadImagesToCloudinary.ts <carpeta-imagenes>");
  console.log("\nEjemplo:");
  console.log("  tsx scripts/uploadImagesToCloudinary.ts ./images/products");
  console.log("\nLa carpeta debe contener:");
  console.log("  - Las imágenes (jpg, png, webp)");
  console.log("  - Un archivo mapping.json con el mapeo filename -> productName");
  process.exit(1);
}

const fullPath = path.isAbsolute(imagesDir) 
  ? imagesDir 
  : path.join(process.cwd(), imagesDir);

uploadImages(fullPath)
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
