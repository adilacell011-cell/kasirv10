BEGIN;

DO $migration_guard$
DECLARE
  application_tables text[];
  unexpected_tables text[];
  table_count integer;
BEGIN
  IF current_database() !~* '(^|[_-])(staging|stage|qa|test)([_-]|$)'
     AND current_database() <> 'kasirv10_migrasi'
     AND current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION 'Refusing product-sales-summary migration outside an approved staging/QA database.';
  END IF;

  SELECT array_agg(tablename ORDER BY tablename), count(*)
    INTO application_tables, table_count
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename <> '_prisma_migrations';

  SELECT array_agg(tablename ORDER BY tablename)
    INTO unexpected_tables
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename <> '_prisma_migrations'
     AND tablename NOT IN (
       'Adjustment', 'Branch', 'BranchStockAudit', 'BranchStockAuditItem',
       'Commission', 'DailyIncomeSummary', 'GlobalConfig', 'Product',
       'ProductStock', 'Sale', 'SaleIdempotency', 'SaleItem', 'Shift',
       'ShoppingPlan', 'StockSnapshot', 'StockTransfer',
       'StockTransferSkuCorrection', 'User', 'VoucherSN'
     );

  IF table_count <> 19
     OR unexpected_tables IS NOT NULL
     OR application_tables IS DISTINCT FROM ARRAY[
       'Adjustment', 'Branch', 'BranchStockAudit', 'BranchStockAuditItem',
       'Commission', 'DailyIncomeSummary', 'GlobalConfig', 'Product',
       'ProductStock', 'Sale', 'SaleIdempotency', 'SaleItem', 'Shift',
       'ShoppingPlan', 'StockSnapshot', 'StockTransfer',
       'StockTransferSkuCorrection', 'User', 'VoucherSN'
     ]::text[] THEN
    RAISE EXCEPTION 'Refusing product-sales-summary migration: database is not the exact approved 19-table schema.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'StockTransfer'
       AND column_name = 'returnOfId'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('DailyProductSalesSummary', 'ProductSalesSummaryEvent')
  ) THEN
    RAISE EXCEPTION 'Refusing product-sales-summary migration: transfer or summary table state is unexpected.';
  END IF;
END
$migration_guard$;

CREATE TABLE "public"."DailyProductSalesSummary" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "saleDate" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyProductSalesSummary_qty_check" CHECK ("qty" >= 0),
  CONSTRAINT "DailyProductSalesSummary_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyProductSalesSummary_branchId_productId_saleDate_key" UNIQUE ("branchId", "productId", "saleDate")
);

CREATE INDEX "DailyProductSalesSummary_saleDate_branchId_productId_idx"
  ON "public"."DailyProductSalesSummary"("saleDate", "branchId", "productId");

CREATE TABLE "public"."ProductSalesSummaryEvent" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "saleDate" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "lines" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "ProductSalesSummaryEvent_kind_check" CHECK ("kind" IN ('SALE', 'REFUND')),
  CONSTRAINT "ProductSalesSummaryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductSalesSummaryEvent_saleId_kind_key" UNIQUE ("saleId", "kind")
);

CREATE INDEX "ProductSalesSummaryEvent_processedAt_createdAt_id_idx"
  ON "public"."ProductSalesSummaryEvent"("processedAt", "createdAt", "id");

CREATE INDEX "ProductSalesSummaryEvent_saleDate_createdAt_id_idx"
  ON "public"."ProductSalesSummaryEvent"("saleDate", "createdAt", "id");

COMMIT;
