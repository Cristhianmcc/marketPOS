// scripts/seedCatalog.ts
// ✅ MÓDULO 18.2: Seed del catálogo global con productos comunes de Perú

import { PrismaClient, UnitType } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// ✅ NORMALIZACIÓN: lowercase, sin tildes, trim, reemplazar múltiples espacios
function normalize(text: string | null | undefined): string {
  if (!text) return "";
  
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/\s+/g, " ") // múltiples espacios => 1
    .replace(/[^\w\s]/g, ""); // remover caracteres raros (opcional)
}

// ✅ FINGERPRINT: clave única derivada de name+brand+content
function generateFingerprint(
  name: string,
  brand?: string | null,
  content?: string | null
): string {
  const normName = normalize(name);
  const normBrand = normalize(brand);
  const normContent = normalize(content);
  
  return `${normName}|${normBrand}|${normContent}`;
}

interface SeedProduct {
  name: string;
  brand?: string;
  content?: string;
  unitType: "UNIT" | "KG";
  category: string;
  barcode?: string;
  imageUrl?: string;
}

async function seedCatalog() {
  console.log("🌱 Iniciando seed del catálogo global...");

  // Leer JSON (V2: sin códigos fake, sin imágenes - owners suben las suyas)
  const filePath = path.join(process.cwd(), "data", "catalog_seed_pe_v2_fixed.json");
  
  if (!fs.existsSync(filePath)) {
    console.error("❌ No se encontró el archivo:", filePath);
    process.exit(1);
  }

  const rawData = fs.readFileSync(filePath, "utf-8");
  const products: SeedProduct[] = JSON.parse(rawData);

  console.log(`📦 Se encontraron ${products.length} productos en el seed`);

  // Obtener SUPERADMIN (primer email de SUPERADMIN_EMAILS)
  const superadminEmail = process.env.SUPERADMIN_EMAILS?.split(",")[0];
  let superadminId: string | null = null;

  if (superadminEmail) {
    const superadmin = await prisma.user.findFirst({
      where: { email: superadminEmail },
    });
    superadminId = superadmin?.id || null;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of products) {
    try {
      const normalizedName = normalize(item.name);
      const fingerprint = generateFingerprint(item.name, item.brand, item.content);

      // Generar internalSku único (timestamp + random)
      const internalSku = `SEED-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      if (item.barcode) {
        // Si tiene barcode: upsert por barcode
        const existing = await prisma.productMaster.findUnique({
          where: { barcode: item.barcode },
        });

        if (existing) {
          // Actualizar (solo si no es global todavía o necesitamos actualizar)
          await prisma.productMaster.update({
            where: { id: existing.id },
            data: {
              name: item.name,
              brand: item.brand,
              content: item.content,
              category: item.category,
              unitType: item.unitType as UnitType,
              imageUrl: item.imageUrl,
              isGlobal: true,
              normalizedName,
              fingerprint,
              approvedAt: new Date(),
              approvedById: superadminId,
            },
          });
          updated++;
        } else {
          // Crear nuevo
          await prisma.productMaster.create({
            data: {
              barcode: item.barcode,
              internalSku,
              name: item.name,
              brand: item.brand,
              content: item.content,
              category: item.category,
              unitType: item.unitType as UnitType,
              imageUrl: item.imageUrl,
              isGlobal: true,
              normalizedName,
              fingerprint,
              approvedAt: new Date(),
              approvedById: superadminId,
              createdByStoreId: null, // seed global
            },
          });
          created++;
        }
      } else {
        // Sin barcode: buscar por fingerprint
        const existing = await prisma.productMaster.findFirst({
          where: { fingerprint },
        });

        if (existing) {
          // Ya existe: actualizar
          await prisma.productMaster.update({
            where: { id: existing.id },
            data: {
              name: item.name,
              brand: item.brand,
              content: item.content,
              category: item.category,
              unitType: item.unitType as UnitType,
              imageUrl: item.imageUrl,
              isGlobal: true,
              normalizedName,
              approvedAt: new Date(),
              approvedById: superadminId,
            },
          });
          updated++;
        } else {
          // Crear nuevo
          await prisma.productMaster.create({
            data: {
              barcode: null,
              internalSku,
              name: item.name,
              brand: item.brand,
              content: item.content,
              category: item.category,
              unitType: item.unitType as UnitType,
              imageUrl: item.imageUrl,
              isGlobal: true,
              normalizedName,
              fingerprint,
              approvedAt: new Date(),
              approvedById: superadminId,
              createdByStoreId: null,
            },
          });
          created++;
        }
      }
    } catch (error) {
      console.error(`❌ Error procesando producto "${item.name}":`, error);
      skipped++;
    }
  }

  console.log("\n✅ Seed completado:");
  console.log(`   - Creados: ${created}`);
  console.log(`   - Actualizados: ${updated}`);
  console.log(`   - Omitidos (error): ${skipped}`);
}

// Ejecutar seed
seedCatalog()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
