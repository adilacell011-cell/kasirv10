BEGIN;

DO $migration_guard$
DECLARE
  application_tables text[];
  unexpected_tables text[];
  table_count integer;
BEGIN
  IF current_database() !~* '(^|[_-])(staging|stage|qa|test)([_-]|$)'
     AND current_database() <> 'kasirv10_migrasi' THEN
    RAISE EXCEPTION 'Refusing transfer-batch migration outside a staging/QA/test database.';
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
    RAISE EXCEPTION 'Refusing transfer-batch migration: database is not the exact approved 19-table schema.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'StockTransfer'
       AND column_name = 'productId'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'StockTransfer'
       AND column_name = 'batchId'
  ) THEN
    RAISE EXCEPTION 'Refusing transfer-batch migration: StockTransfer column state is unexpected.';
  END IF;
END
$migration_guard$;

ALTER TABLE "public"."StockTransfer"
  ADD COLUMN "batchId" TEXT;

CREATE INDEX "StockTransfer_batchId_createdAt_idx"
  ON "public"."StockTransfer"("batchId", "createdAt");

COMMIT;
