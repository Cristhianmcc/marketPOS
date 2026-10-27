-- Afectaciones IGV (gravado/exonerado/inafecto) e ICBPER. Solo agrega tipos y
-- columnas con valor por defecto: los datos existentes quedan como gravados.

-- CreateEnum
CREATE TYPE "IgvAffectation" AS ENUM ('GRAVADO', 'EXONERADO', 'INAFECTO');

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "icbper" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "igv_affectation" "IgvAffectation" NOT NULL DEFAULT 'GRAVADO';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "icbper_total" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "icbper_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "icbper_quantity" DECIMAL(10,3),
ADD COLUMN     "igv_affectation" "IgvAffectation" NOT NULL DEFAULT 'GRAVADO',
ADD COLUMN     "igv_amount" DECIMAL(10,2),
ADD COLUMN     "taxable_amount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "electronic_documents" ADD COLUMN     "exempt" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "icbper" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unaffected" DECIMAL(10,2) NOT NULL DEFAULT 0;

