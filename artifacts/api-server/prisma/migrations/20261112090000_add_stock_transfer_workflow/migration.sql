BEGIN;

DO $migration_guard$
DECLARE
  missing_tables text[];
BEGIN
  IF current_database() !~* '(^|[_-])(staging|stage|qa|test)([_-]|$)'
     AND current_database() <> 'kasirv10_migrasi' THEN
    RAISE EXCEPTION 'Refusing stock-transfer migration outside a staging/QA/test database.';
  END IF;

  SELECT array_agg(required.table_name ORDER BY required.table_name)
    INTO missing_tables
    FROM unnest(ARRAY[
      'User', 'Branch', 'Product', 'ProductStock', 'VoucherSN', 'Sale',
      'SaleIdempotency', 'SaleItem', 'Commission', 'Adjustment',
      'GlobalConfig', 'Shift', 'StockSnapshot', 'DailyIncomeSummary',
      'ShoppingPlan', 'BranchStockAudit', 'BranchStockAuditItem'
    ]::text[]) AS required(table_name)
   WHERE to_regclass(format('%I.%I', 'public', required.table_name)) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing stock-transfer migration: expected the approved 17-table schema; missing: %.',
      array_to_string(missing_tables, ', ');
  END IF;

  IF to_regclass('public."StockTransfer"') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing stock-transfer migration: target table already exists; inspect schema and migration history.';
  END IF;
END
$migration_guard$;

CREATE TABLE "public"."StockTransfer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "targetBranchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedQty" INTEGER,
    "approvedQty" INTEGER,
    "dispatchedQty" INTEGER,
    "receivedQty" INTEGER,
    "requestNote" TEXT,
    "responseNote" TEXT,
    "discrepancyNote" TEXT,
    "requestedById" TEXT,
    "acceptedById" TEXT,
    "dispatchedById" TEXT,
    "receivedById" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockTransfer_kind_check" CHECK ("kind" IN ('REQUEST', 'DIRECT')),
    CONSTRAINT "StockTransfer_status_check" CHECK ("status" IN ('REQUESTED', 'ACCEPTED', 'IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT "StockTransfer_requestedQty_check" CHECK ("requestedQty" IS NULL OR "requestedQty" > 0),
    CONSTRAINT "StockTransfer_approvedQty_check" CHECK ("approvedQty" IS NULL OR "approvedQty" > 0),
    CONSTRAINT "StockTransfer_dispatchedQty_check" CHECK ("dispatchedQty" IS NULL OR "dispatchedQty" > 0),
    CONSTRAINT "StockTransfer_receivedQty_check" CHECK ("receivedQty" IS NULL OR "receivedQty" >= 0)
);

CREATE INDEX "StockTransfer_sourceBranchId_status_createdAt_idx"
  ON "public"."StockTransfer"("sourceBranchId", "status", "createdAt");
CREATE INDEX "StockTransfer_targetBranchId_status_createdAt_idx"
  ON "public"."StockTransfer"("targetBranchId", "status", "createdAt");
CREATE INDEX "StockTransfer_productId_createdAt_idx"
  ON "public"."StockTransfer"("productId", "createdAt");

ALTER TABLE "public"."StockTransfer"
  ADD CONSTRAINT "StockTransfer_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "public"."Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransfer"
  ADD CONSTRAINT "StockTransfer_sourceBranchId_fkey"
  FOREIGN KEY ("sourceBranchId") REFERENCES "public"."Branch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransfer"
  ADD CONSTRAINT "StockTransfer_targetBranchId_fkey"
  FOREIGN KEY ("targetBranchId") REFERENCES "public"."Branch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransfer"
  ADD CONSTRAINT "StockTransfer_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransfer"
  ADD CONSTRAINT "StockTransfer_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransfer"
  ADD CONSTRAINT "StockTransfer_dispatchedById_fkey"
  FOREIGN KEY ("dispatchedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransfer"
  ADD CONSTRAINT "StockTransfer_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."StockTransfer"
  ADD CONSTRAINT "StockTransfer_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
