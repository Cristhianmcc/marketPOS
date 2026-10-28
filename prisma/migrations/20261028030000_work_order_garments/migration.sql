-- Lavandería: prendas recibidas en la orden ([{ name, qty }]). Columna opcional:
-- las órdenes existentes quedan sin conteo de prendas.

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "garments" JSONB;
