-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'CASHIER');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('UNIT', 'KG');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('SALE', 'PURCHASE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'YAPE', 'PLIN', 'CARD', 'FIADO');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('TWO_FOR_ONE', 'PACK_PRICE', 'HAPPY_HOUR');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "VolumePromoType" AS ENUM ('FIXED_PRICE');

-- CreateEnum
CREATE TYPE "NthPromoType" AS ENUM ('NTH_PERCENT');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('DEMO', 'STARTER', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('GOODS', 'SERVICES');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('NONE', 'ROUND', 'CEIL', 'FLOOR');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('BASE_UNIT', 'SELL_UNIT_OVERRIDE');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'READY', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderItemType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "BusinessProfile" AS ENUM ('BODEGA', 'FERRETERIA', 'TALLER', 'LAVANDERIA', 'POLLERIA', 'HOSTAL', 'BOTICA', 'ACCESORIOS');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('SALE', 'SHIFT', 'COUPON', 'PROMOTION', 'STORE', 'CUSTOMER', 'RECEIVABLE', 'USER', 'PRODUCT', 'RESTORE', 'SYSTEM', 'SUBSCRIPTION', 'PAYMENT', 'CATALOG', 'SUNAT');

-- CreateEnum
CREATE TYPE "FeatureFlagKey" AS ENUM ('ALLOW_FIADO', 'ALLOW_COUPONS', 'ENABLE_PROMOTIONS', 'ENABLE_VOLUME_PROMOS', 'ENABLE_NTH_PROMOS', 'ENABLE_CATEGORY_PROMOS', 'ENABLE_SUNAT', 'ENABLE_ADVANCED_UNITS', 'ENABLE_CONVERSIONS', 'ENABLE_SERVICES', 'ENABLE_WORK_ORDERS', 'ENABLE_RESERVATIONS', 'ENABLE_BATCH_EXPIRY', 'ENABLE_SELLUNIT_PRICING');

-- CreateEnum
CREATE TYPE "SunatDocType" AS ENUM ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'SUMMARY', 'VOIDED');

-- CreateEnum
CREATE TYPE "SunatStatus" AS ENUM ('DRAFT', 'PENDING', 'XML_BUILT', 'SIGNED', 'SENT', 'ACCEPTED', 'REJECTED', 'OBSERVED', 'ERROR', 'CANCELED');

-- CreateEnum
CREATE TYPE "SunatEnv" AS ENUM ('BETA', 'PROD');

-- CreateEnum
CREATE TYPE "CustomerDocType" AS ENUM ('DNI', 'RUC', 'CE', 'PASSPORT', 'OTHER');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "business_profile" "BusinessProfile" NOT NULL DEFAULT 'BODEGA',
    "is_demo_store" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products_master" (
    "id" TEXT NOT NULL,
    "barcode" TEXT,
    "internal_sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "content" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Otros',
    "unit_type" "UnitType" NOT NULL,
    "image_url" TEXT,
    "is_quick_sell" BOOLEAN NOT NULL DEFAULT false,
    "quick_sell_order" INTEGER,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "created_by_store_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "normalized_name" TEXT,
    "fingerprint" TEXT,
    "merged_into_id" TEXT,
    "base_unit_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_products" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stock" DECIMAL(10,3),
    "min_stock" DECIMAL(10,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "opened_by" TEXT NOT NULL,
    "closed_by" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_cash" DECIMAL(10,2) NOT NULL,
    "closing_cash" DECIMAL(10,2),
    "expected_cash" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "customer_id" TEXT,
    "sale_number" INTEGER NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "discount_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_before_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "coupon_code" TEXT,
    "coupon_type" "CouponType",
    "coupon_value" DECIMAL(10,2),
    "coupon_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_before_coupon" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount_paid" DECIMAL(10,2),
    "change_amount" DECIMAL(10,2),
    "printed_at" TIMESTAMP(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "store_product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "product_content" TEXT,
    "unit_type" "UnitType" NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount_type" "DiscountType",
    "discount_value" DECIMAL(10,2),
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_line" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "promotion_type" "PromotionType",
    "promotion_name" TEXT,
    "promotion_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "category_promo_name" TEXT,
    "category_promo_type" "DiscountType",
    "category_promo_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "volume_promo_name" TEXT,
    "volume_promo_qty" INTEGER,
    "volume_promo_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "nth_promo_name" TEXT,
    "nth_promo_qty" INTEGER,
    "nth_promo_percent" DECIMAL(5,2),
    "nth_promo_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "service_id" TEXT,
    "is_service" BOOLEAN NOT NULL DEFAULT false,
    "unit_sunat_code" TEXT,
    "unit_symbol" TEXT,
    "unit_code_used" TEXT,
    "quantity_original" DECIMAL(10,3),
    "quantity_base" DECIMAL(10,3),
    "conversion_factor_used" DECIMAL(12,6),
    "pricing_mode" "PricingMode",
    "sell_unit_price_applied" DECIMAL(10,2),

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movements" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "store_product_id" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2),
    "total" DECIMAL(10,2),
    "notes" TEXT,
    "created_by" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "ticket_footer" TEXT,
    "ticket_header_line1" VARCHAR(100),
    "ticket_header_line2" VARCHAR(100),
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "onboarding_completed_at" TIMESTAMP(3),
    "onboarding_step" INTEGER NOT NULL DEFAULT 0,
    "onboarding_dismissed_at" TIMESTAMP(3),
    "default_payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "dni" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "original_amount" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "created_by" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_payments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "receivable_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "product_id" TEXT,
    "min_qty" INTEGER,
    "pack_price" DECIMAL(10,2),
    "happy_start" TIMESTAMP(3),
    "happy_end" TIMESTAMP(3),
    "happy_price" DECIMAL(10,2),
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "min_total" DECIMAL(10,2),
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "max_uses" INTEGER,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_promotions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "max_discount_per_item" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volume_promotions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "VolumePromoType" NOT NULL,
    "required_qty" INTEGER NOT NULL,
    "packPrice" DECIMAL(10,2) NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volume_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nth_promotions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "NthPromoType" NOT NULL,
    "nth_qty" INTEGER NOT NULL,
    "percent_off" DECIMAL(5,2) NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nth_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "store_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" "AuditEntityType" NOT NULL,
    "entity_id" TEXT,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "meta" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "key" "FeatureFlagKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_limits" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "max_discount_percent" DECIMAL(5,2),
    "max_manual_discount_amount" DECIMAL(10,2),
    "max_sale_total" DECIMAL(10,2),
    "max_items_per_sale" INTEGER,
    "max_receivable_balance" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "plan_code" "PlanCode" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "start_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_ends_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "grace_ends_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "price_amount" DECIMAL(10,2) NOT NULL,
    "price_currency" TEXT NOT NULL DEFAULT 'PEN',
    "billing_cycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sunat_settings" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "env" "SunatEnv" NOT NULL DEFAULT 'BETA',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "ruc" TEXT,
    "razon_social" TEXT,
    "address" TEXT,
    "ubigeo" TEXT,
    "sol_user" TEXT,
    "sol_pass" TEXT,
    "cert_pfx_base64" TEXT,
    "cert_password" TEXT,
    "step_fiscal_data" BOOLEAN NOT NULL DEFAULT false,
    "step_sol_credentials" BOOLEAN NOT NULL DEFAULT false,
    "step_certificate" BOOLEAN NOT NULL DEFAULT false,
    "step_test_sign" BOOLEAN NOT NULL DEFAULT false,
    "step_test_beta" BOOLEAN NOT NULL DEFAULT false,
    "auto_emit_boleta" BOOLEAN NOT NULL DEFAULT true,
    "allow_factura" BOOLEAN NOT NULL DEFAULT false,
    "default_doc_type" TEXT NOT NULL DEFAULT 'NONE',
    "default_factura_series" TEXT NOT NULL DEFAULT 'F001',
    "default_boleta_series" TEXT NOT NULL DEFAULT 'B001',
    "default_nc_series" TEXT NOT NULL DEFAULT 'FC01',
    "default_nd_series" TEXT NOT NULL DEFAULT 'FD01',
    "default_summary_series" TEXT NOT NULL DEFAULT 'RC01',
    "default_voided_series" TEXT NOT NULL DEFAULT 'RA01',
    "next_factura_number" INTEGER NOT NULL DEFAULT 1,
    "next_boleta_number" INTEGER NOT NULL DEFAULT 1,
    "next_nc_number" INTEGER NOT NULL DEFAULT 1,
    "next_nd_number" INTEGER NOT NULL DEFAULT 1,
    "next_summary_number" INTEGER NOT NULL DEFAULT 1,
    "next_voided_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sunat_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electronic_documents" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "doc_type" "SunatDocType" NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "full_number" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "customer_doc_type" "CustomerDocType" NOT NULL,
    "customer_doc_number" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_address" TEXT,
    "taxable" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "status" "SunatStatus" NOT NULL DEFAULT 'DRAFT',
    "hash" TEXT,
    "qr_text" TEXT,
    "xml_signed" TEXT,
    "cdr_zip" TEXT,
    "sunat_ticket" TEXT,
    "sunat_code" TEXT,
    "sunat_message" TEXT,
    "sunat_response_at" TIMESTAMP(3),
    "reported_in_summary" BOOLEAN NOT NULL DEFAULT false,
    "reference_doc_id" TEXT,
    "void_reason" TEXT,
    "zip_sent_base64" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electronic_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sunat_jobs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "electronic_document_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_run_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sunat_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sunat_code" TEXT,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "symbol" TEXT,
    "kind" "UnitKind" NOT NULL DEFAULT 'GOODS',
    "allow_decimals" BOOLEAN NOT NULL DEFAULT false,
    "precision" INTEGER NOT NULL DEFAULT 0,
    "is_base" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_conversions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_master_id" TEXT NOT NULL,
    "from_unit_id" TEXT NOT NULL,
    "to_unit_id" TEXT NOT NULL,
    "factor_to_base" DECIMAL(18,6) NOT NULL,
    "rounding_mode" "RoundingMode" NOT NULL DEFAULT 'NONE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sell_unit_prices" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_master_id" TEXT NOT NULL,
    "sell_unit_id" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sell_unit_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "base_unit_id" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "order_number" INTEGER NOT NULL,
    "customer_id" TEXT,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sale_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_items" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "type" "WorkOrderItemType" NOT NULL,
    "store_product_id" TEXT,
    "service_id" TEXT,
    "item_name" TEXT NOT NULL,
    "item_content" TEXT,
    "unit_id_used" TEXT,
    "quantity_original" DECIMAL(12,4),
    "quantity_base" DECIMAL(12,4) NOT NULL,
    "conversion_factor" DECIMAL(12,6),
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_store_id_idx" ON "users"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_master_barcode_key" ON "products_master"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_master_internal_sku_key" ON "products_master"("internal_sku");

-- CreateIndex
CREATE INDEX "products_master_barcode_idx" ON "products_master"("barcode");

-- CreateIndex
CREATE INDEX "products_master_name_idx" ON "products_master"("name");

-- CreateIndex
CREATE INDEX "products_master_internal_sku_idx" ON "products_master"("internal_sku");

-- CreateIndex
CREATE INDEX "products_master_is_global_idx" ON "products_master"("is_global");

-- CreateIndex
CREATE INDEX "products_master_created_by_store_id_idx" ON "products_master"("created_by_store_id");

-- CreateIndex
CREATE INDEX "products_master_normalized_name_idx" ON "products_master"("normalized_name");

-- CreateIndex
CREATE INDEX "products_master_fingerprint_idx" ON "products_master"("fingerprint");

-- CreateIndex
CREATE INDEX "store_products_store_id_idx" ON "store_products"("store_id");

-- CreateIndex
CREATE INDEX "store_products_product_id_idx" ON "store_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_products_store_id_product_id_key" ON "store_products"("store_id", "product_id");

-- CreateIndex
CREATE INDEX "shifts_store_id_opened_at_idx" ON "shifts"("store_id", "opened_at");

-- CreateIndex
CREATE INDEX "sales_store_id_created_at_idx" ON "sales"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_shift_id_idx" ON "sales"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_store_id_sale_number_key" ON "sales"("store_id", "sale_number");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_store_product_id_idx" ON "sale_items"("store_product_id");

-- CreateIndex
CREATE INDEX "sale_items_service_id_idx" ON "sale_items"("service_id");

-- CreateIndex
CREATE INDEX "movements_store_id_created_at_idx" ON "movements"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "movements_store_product_id_created_at_idx" ON "movements"("store_product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_store_id_key" ON "store_settings"("store_id");

-- CreateIndex
CREATE INDEX "customers_store_id_name_idx" ON "customers"("store_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_sale_id_key" ON "receivables"("sale_id");

-- CreateIndex
CREATE INDEX "receivables_store_id_status_idx" ON "receivables"("store_id", "status");

-- CreateIndex
CREATE INDEX "receivables_customer_id_idx" ON "receivables"("customer_id");

-- CreateIndex
CREATE INDEX "receivable_payments_receivable_id_idx" ON "receivable_payments"("receivable_id");

-- CreateIndex
CREATE INDEX "receivable_payments_shift_id_idx" ON "receivable_payments"("shift_id");

-- CreateIndex
CREATE INDEX "receivable_payments_store_id_created_at_idx" ON "receivable_payments"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "promotions_store_id_active_idx" ON "promotions"("store_id", "active");

-- CreateIndex
CREATE INDEX "promotions_product_id_idx" ON "promotions"("product_id");

-- CreateIndex
CREATE INDEX "coupons_store_id_active_idx" ON "coupons"("store_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_store_id_code_key" ON "coupons"("store_id", "code");

-- CreateIndex
CREATE INDEX "category_promotions_store_id_active_idx" ON "category_promotions"("store_id", "active");

-- CreateIndex
CREATE INDEX "category_promotions_store_id_category_idx" ON "category_promotions"("store_id", "category");

-- CreateIndex
CREATE INDEX "volume_promotions_store_id_active_idx" ON "volume_promotions"("store_id", "active");

-- CreateIndex
CREATE INDEX "volume_promotions_store_id_product_id_idx" ON "volume_promotions"("store_id", "product_id");

-- CreateIndex
CREATE INDEX "nth_promotions_store_id_active_idx" ON "nth_promotions"("store_id", "active");

-- CreateIndex
CREATE INDEX "nth_promotions_store_id_product_id_idx" ON "nth_promotions"("store_id", "product_id");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_created_at_idx" ON "audit_logs"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_severity_idx" ON "audit_logs"("severity");

-- CreateIndex
CREATE INDEX "audit_logs_severity_created_at_idx" ON "audit_logs"("severity", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "feature_flags_store_id_idx" ON "feature_flags"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_store_id_key_key" ON "feature_flags"("store_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "operational_limits_store_id_key" ON "operational_limits"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_store_id_key" ON "subscriptions"("store_id");

-- CreateIndex
CREATE INDEX "subscriptions_store_id_idx" ON "subscriptions"("store_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "payments_store_id_idx" ON "payments"("store_id");

-- CreateIndex
CREATE INDEX "payments_subscription_id_idx" ON "payments"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "sunat_settings_store_id_key" ON "sunat_settings"("store_id");

-- CreateIndex
CREATE INDEX "electronic_documents_store_id_status_idx" ON "electronic_documents"("store_id", "status");

-- CreateIndex
CREATE INDEX "electronic_documents_sale_id_idx" ON "electronic_documents"("sale_id");

-- CreateIndex
CREATE INDEX "electronic_documents_store_id_doc_type_issue_date_idx" ON "electronic_documents"("store_id", "doc_type", "issue_date");

-- CreateIndex
CREATE INDEX "electronic_documents_store_id_reported_in_summary_idx" ON "electronic_documents"("store_id", "reported_in_summary");

-- CreateIndex
CREATE INDEX "electronic_documents_store_id_issue_date_idx" ON "electronic_documents"("store_id", "issue_date");

-- CreateIndex
CREATE INDEX "electronic_documents_full_number_idx" ON "electronic_documents"("full_number");

-- CreateIndex
CREATE INDEX "electronic_documents_doc_type_idx" ON "electronic_documents"("doc_type");

-- CreateIndex
CREATE UNIQUE INDEX "electronic_documents_store_id_doc_type_series_number_key" ON "electronic_documents"("store_id", "doc_type", "series", "number");

-- CreateIndex
CREATE INDEX "sunat_jobs_status_next_run_at_idx" ON "sunat_jobs"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "sunat_jobs_electronic_document_id_idx" ON "sunat_jobs"("electronic_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "units_sunat_code_key" ON "units"("sunat_code");

-- CreateIndex
CREATE INDEX "units_code_idx" ON "units"("code");

-- CreateIndex
CREATE INDEX "units_sunat_code_idx" ON "units"("sunat_code");

-- CreateIndex
CREATE INDEX "units_kind_idx" ON "units"("kind");

-- CreateIndex
CREATE INDEX "units_active_idx" ON "units"("active");

-- CreateIndex
CREATE INDEX "unit_conversions_store_id_idx" ON "unit_conversions"("store_id");

-- CreateIndex
CREATE INDEX "unit_conversions_product_master_id_idx" ON "unit_conversions"("product_master_id");

-- CreateIndex
CREATE INDEX "unit_conversions_store_id_product_master_id_idx" ON "unit_conversions"("store_id", "product_master_id");

-- CreateIndex
CREATE INDEX "unit_conversions_from_unit_id_idx" ON "unit_conversions"("from_unit_id");

-- CreateIndex
CREATE INDEX "unit_conversions_to_unit_id_idx" ON "unit_conversions"("to_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_conversions_store_id_product_master_id_from_unit_id_to_key" ON "unit_conversions"("store_id", "product_master_id", "from_unit_id", "to_unit_id");

-- CreateIndex
CREATE INDEX "sell_unit_prices_store_id_idx" ON "sell_unit_prices"("store_id");

-- CreateIndex
CREATE INDEX "sell_unit_prices_product_master_id_idx" ON "sell_unit_prices"("product_master_id");

-- CreateIndex
CREATE INDEX "sell_unit_prices_store_id_product_master_id_idx" ON "sell_unit_prices"("store_id", "product_master_id");

-- CreateIndex
CREATE UNIQUE INDEX "sell_unit_prices_store_id_product_master_id_sell_unit_id_key" ON "sell_unit_prices"("store_id", "product_master_id", "sell_unit_id");

-- CreateIndex
CREATE INDEX "categories_store_id_idx" ON "categories"("store_id");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_store_id_slug_key" ON "categories"("store_id", "slug");

-- CreateIndex
CREATE INDEX "services_store_id_idx" ON "services"("store_id");

-- CreateIndex
CREATE INDEX "services_name_idx" ON "services"("name");

-- CreateIndex
CREATE UNIQUE INDEX "services_store_id_name_key" ON "services"("store_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_sale_id_key" ON "work_orders"("sale_id");

-- CreateIndex
CREATE INDEX "work_orders_store_id_idx" ON "work_orders"("store_id");

-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

-- CreateIndex
CREATE INDEX "work_orders_customer_id_idx" ON "work_orders"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_store_id_order_number_key" ON "work_orders"("store_id", "order_number");

-- CreateIndex
CREATE INDEX "work_order_items_work_order_id_idx" ON "work_order_items"("work_order_id");

-- CreateIndex
CREATE INDEX "work_order_items_store_product_id_idx" ON "work_order_items"("store_product_id");

-- CreateIndex
CREATE INDEX "work_order_items_service_id_idx" ON "work_order_items"("service_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products_master" ADD CONSTRAINT "products_master_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products_master" ADD CONSTRAINT "products_master_created_by_store_id_fkey" FOREIGN KEY ("created_by_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products_master" ADD CONSTRAINT "products_master_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_store_product_id_fkey" FOREIGN KEY ("store_product_id") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_store_product_id_fkey" FOREIGN KEY ("store_product_id") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_promotions" ADD CONSTRAINT "category_promotions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_promotions" ADD CONSTRAINT "volume_promotions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_promotions" ADD CONSTRAINT "volume_promotions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nth_promotions" ADD CONSTRAINT "nth_promotions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nth_promotions" ADD CONSTRAINT "nth_promotions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_limits" ADD CONSTRAINT "operational_limits_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sunat_settings" ADD CONSTRAINT "sunat_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_sunat_settings_fkey" FOREIGN KEY ("store_id") REFERENCES "sunat_settings"("store_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_reference_doc_id_fkey" FOREIGN KEY ("reference_doc_id") REFERENCES "electronic_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sunat_jobs" ADD CONSTRAINT "sunat_jobs_electronic_document_id_fkey" FOREIGN KEY ("electronic_document_id") REFERENCES "electronic_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_product_master_id_fkey" FOREIGN KEY ("product_master_id") REFERENCES "products_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_from_unit_id_fkey" FOREIGN KEY ("from_unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_to_unit_id_fkey" FOREIGN KEY ("to_unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sell_unit_prices" ADD CONSTRAINT "sell_unit_prices_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sell_unit_prices" ADD CONSTRAINT "sell_unit_prices_product_master_id_fkey" FOREIGN KEY ("product_master_id") REFERENCES "products_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sell_unit_prices" ADD CONSTRAINT "sell_unit_prices_sell_unit_id_fkey" FOREIGN KEY ("sell_unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_store_product_id_fkey" FOREIGN KEY ("store_product_id") REFERENCES "store_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_unit_id_used_fkey" FOREIGN KEY ("unit_id_used") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

