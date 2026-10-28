-- Órdenes express (lavandería): recargo porcentual y fecha prometida. Solo agrega
-- columnas con valor por defecto: las órdenes existentes quedan como normales.

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "express_surcharge_percent" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "express" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "express_surcharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promised_at" TIMESTAMP(3);
