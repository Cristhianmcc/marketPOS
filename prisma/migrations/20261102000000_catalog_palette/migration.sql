-- Catálogo web: paleta de colores elegida por la tienda. Las tiendas existentes
-- quedan con la paleta actual ("crema"), así que su catálogo no cambia.

-- AlterTable
ALTER TABLE "catalog_settings" ADD COLUMN     "catalog_palette" TEXT NOT NULL DEFAULT 'crema';
