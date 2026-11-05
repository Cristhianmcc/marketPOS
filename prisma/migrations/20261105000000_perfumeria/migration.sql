-- Perfumería: perfil PERFUMERIA, fragancias (esencia en ml de la sede),
-- presentaciones con precio/ml/envase y snapshot de la línea de venta.
-- Solo agrega: las tiendas existentes no cambian.

-- AlterEnum
ALTER TYPE "BusinessProfile" ADD VALUE 'PERFUMERIA';

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "perfume_detail" JSONB;

-- CreateTable
CREATE TABLE "fragrances" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "store_product_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reference" TEXT,
    "reference_brand" TEXT,
    "gender" TEXT,
    "family" TEXT,
    "aromas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "occasions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scent" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fragrances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfume_presentations" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "essence_ml" DECIMAL(10,3) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "list_price" DECIMAL(10,2),
    "container_store_product_id" TEXT,
    "is_refill" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfume_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fragrances_store_product_id_key" ON "fragrances"("store_product_id");

-- CreateIndex
CREATE INDEX "fragrances_store_id_gender_idx" ON "fragrances"("store_id", "gender");

-- CreateIndex
CREATE UNIQUE INDEX "fragrances_store_id_code_key" ON "fragrances"("store_id", "code");

-- CreateIndex
CREATE INDEX "perfume_presentations_store_id_active_idx" ON "perfume_presentations"("store_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "perfume_presentations_store_id_name_key" ON "perfume_presentations"("store_id", "name");

-- AddForeignKey
ALTER TABLE "fragrances" ADD CONSTRAINT "fragrances_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fragrances" ADD CONSTRAINT "fragrances_store_product_id_fkey" FOREIGN KEY ("store_product_id") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfume_presentations" ADD CONSTRAINT "perfume_presentations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfume_presentations" ADD CONSTRAINT "perfume_presentations_container_store_product_id_fkey" FOREIGN KEY ("container_store_product_id") REFERENCES "store_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

