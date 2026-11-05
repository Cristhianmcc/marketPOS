-- Perfumería fase 2: rellenos con compra previa, promos 2x1/3x2 por
-- presentación, extras de la línea (feromonas, esencia extra), packs y
-- atributos de la fragancia para el catálogo web.
-- Solo agrega: las tiendas existentes no cambian.

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "catalog_attributes" JSONB;

-- AlterTable
ALTER TABLE "perfume_presentations" ADD COLUMN     "grants_refill" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promo_buy" INTEGER,
ADD COLUMN     "promo_pay" INTEGER,
ADD COLUMN     "requires_prior_purchase" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "perfume_extras" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "store_product_id" TEXT,
    "product_qty" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "extra_essence_ml" DECIMAL(10,3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfume_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfume_packs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "essence_ml" DECIMAL(10,3) NOT NULL,
    "fragrance_count" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "list_price" DECIMAL(10,2),
    "gift_store_product_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfume_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfume_extras_store_id_name_key" ON "perfume_extras"("store_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "perfume_packs_store_id_name_key" ON "perfume_packs"("store_id", "name");

-- AddForeignKey
ALTER TABLE "perfume_extras" ADD CONSTRAINT "perfume_extras_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfume_extras" ADD CONSTRAINT "perfume_extras_store_product_id_fkey" FOREIGN KEY ("store_product_id") REFERENCES "store_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfume_packs" ADD CONSTRAINT "perfume_packs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfume_packs" ADD CONSTRAINT "perfume_packs_gift_store_product_id_fkey" FOREIGN KEY ("gift_store_product_id") REFERENCES "store_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

