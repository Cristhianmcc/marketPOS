-- Lavandería: precio del kilo de ropa vigente. Columna opcional: las tiendas
-- existentes quedan sin precio por kilo (el total se sigue escribiendo a mano).

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "laundry_kg_price" DECIMAL(10,2);
