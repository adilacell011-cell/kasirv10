BEGIN;

DO $migration_guard$
DECLARE
  missing_tables text[];
  unexpected_tables text[];
  application_table_count integer;
BEGIN
  IF current_database() !~* '(^|[_-])(staging|stage|qa|test)([_-]|$)'
     AND current_database() <> 'kasirv10_migrasi' THEN
    RAISE EXCEPTION 'Refusing transfer SKU-correction migration outside a staging/QA/test database.';
  END IF;

  SELECT array_agg(required.table_name ORDER BY required.table_name)
    INTO missing_tables
    FROM unnest(ARRAY[
      'User', 'Branch', 'Product', 'ProductStock', 'VoucherSN', 'Sale',
      'SaleIdempotency', 'SaleItem', 'Commission', 'Adjustment',
      'GlobalConfig', 'Shift', 'StockSnapshot', 'DailyIncomeSummary',
      'ShoppingPlan', 'BranchStockAudit', 'BranchStockAuditItem', 'StockTransfer'
    ]::text[]) AS required(table_name)
   WHERE to_regclass(format('%I.%I', 'public', required.table_name)) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing transfer SKU-correction migration: expected the approved 18-table transfer schema; missing: %.',
      array_to_string(missing_tables, ', ');
  END IF;

  SELECT count(*)
    INTO application_table_count
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_type = 'BASE TABLE'
     AND table_name <> '_prisma_migrations';

  SELECT array_agg(table_name ORDER BY table_name)
    INTO unexpected_tables
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_type = 'BASE TABLE'
     AND table_name <> '_prisma_migrations'
     AND table_name NOT IN (
       'User', 'Branch', 'Product', 'ProductStock', 'VoucherSN', 'Sale',
       'SaleIdempotency', 'SaleItem', 'Commission', 'Adjustment',
       'GlobalConfig', 'Shift', 'StockSnapshot', 'DailyIncomeSummary',
       'ShoppingPlan', 'BranchStockAudit', 'BranchStockAuditItem', 'StockTransfer'
     );

  IF application_table_count <> 18 OR unexpected_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing transfer SKU-correction migration: schema is not the exact approved 18-table state.';
  END IF;

  IF to_regclass('public."StockTransferSkuCorrection"') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing transfer SKU-correction migration: target table already exists; inspect schema and migration history.';
  END IF;
END
$migration_guard$;

CREATE TABLE "public"."StockTransferSkuCorrection" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "actualProductId" TEXT NOT NULL,
    "actualQty" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseNote" TEXT,
    "reportedById" TEXT,
    "reviewedById" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    CONSTRAINT "StockTransferSkuCorrection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockTransferSkuCorrection_status_check"
      CHECK ("status" IN ('PENDING_SOURCE', 'APPROVED_PENDING_RECEIPT', 'REJECTED', 'RECEIVED')),
    CONSTRAINT "StockTransferSkuCorrection_actualQty_check" CHECK ("actualQty" > 0)
);

CREATE INDEX "StockTransferSkuCorrection_transferId_createdAt_idx"
  ON "public"."StockTransferSkuCorrection"("transferId", "createdAt");
CREATE INDEX "StockTransferSkuCorrection_status_createdAt_idx"
  ON "public"."StockTransferSkuCorrection"("status", "createdAt");
CREATE INDEX "StockTransferSkuCorrection_actualProductId_createdAt_idx"
  ON "public"."StockTransferSkuCorrection"("actualProductId", "createdAt");
CREATE UNIQUE INDEX "StockTransferSkuCorrection_one_open_per_transfer_idx"
  ON "public"."StockTransferSkuCorrection"("transferId")
  WHERE "status" IN ('PENDING_SOURCE', 'APPROVED_PENDING_RECEIPT');

ALTER TABLE "public"."StockTransferSkuCorrection"
  ADD CONSTRAINT "StockTransferSkuCorrection_transferId_fkey"
  FOREIGN KEY ("transferId") REFERENCES "public"."StockTransfer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransferSkuCorrection"
  ADD CONSTRAINT "StockTransferSkuCorrection_actualProductId_fkey"
  FOREIGN KEY ("actualProductId") REFERENCES "public"."Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransferSkuCorrection"
  ADD CONSTRAINT "StockTransferSkuCorrection_reportedById_fkey"
  FOREIGN KEY ("reportedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransferSkuCorrection"
  ADD CONSTRAINT "StockTransferSkuCorrection_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransferSkuCorrection"
  ADD CONSTRAINT "StockTransferSkuCorrection_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
