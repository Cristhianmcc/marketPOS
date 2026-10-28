-- Adelantos de órdenes de trabajo (lavandería). Solo agrega un tipo, una tabla y
-- columnas con valor por defecto: las órdenes y ventas existentes quedan sin adelanto.

-- CreateEnum
CREATE TYPE "WorkOrderPaymentKind" AS ENUM ('ADVANCE', 'REFUND');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "advance_applied" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "advance_paid" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "work_order_payments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "kind" "WorkOrderPaymentKind" NOT NULL DEFAULT 'ADVANCE',
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_payments_store_id_idx" ON "work_order_payments"("store_id");

-- CreateIndex
CREATE INDEX "work_order_payments_work_order_id_idx" ON "work_order_payments"("work_order_id");

-- CreateIndex
CREATE INDEX "work_order_payments_shift_id_idx" ON "work_order_payments"("shift_id");

-- AddForeignKey
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
