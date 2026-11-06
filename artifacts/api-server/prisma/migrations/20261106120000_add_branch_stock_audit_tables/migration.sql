BEGIN;

DO $migration_guard$
DECLARE
  missing_legacy_tables text[];
BEGIN
  IF current_database() !~* '(^|[_-])(staging|stage|qa|test)([_-]|$)' THEN
    RAISE EXCEPTION 'Refusing Audit Stok migration outside a staging/QA/test database.';
  END IF;

  SELECT array_agg(required.table_name ORDER BY required.table_name)
    INTO missing_legacy_tables
    FROM unnest(ARRAY[
      'User', 'Branch', 'Product', 'ProductStock', 'VoucherSN', 'Sale',
      'SaleIdempotency', 'SaleItem', 'Commission', 'Adjustment',
      'GlobalConfig', 'Shift', 'StockSnapshot', 'DailyIncomeSummary',
      'ShoppingPlan'
    ]::text[]) AS required(table_name)
   WHERE to_regclass(format('%I.%I', 'public', required.table_name)) IS NULL;

  IF missing_legacy_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing Audit Stok migration: legacy schema is missing required tables: %.',
      array_to_string(missing_legacy_tables, ', ');
  END IF;

  IF to_regclass('public."BranchStockAudit"') IS NOT NULL
     OR to_regclass('public."BranchStockAuditItem"') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing Audit Stok migration: one or both target tables already exist; inspect schema and migration history.';
  END IF;
END
$migration_guard$;

CREATE TABLE "public"."BranchStockAudit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchNameSnapshot" TEXT NOT NULL,
    "activeBranchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedById" TEXT NOT NULL,
    "startedByName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" TEXT,
    "completedByName" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledByName" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "BranchStockAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."BranchStockAuditItem" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "barcodeSnapshot" TEXT,
    "masterSNSnapshot" TEXT,
    "inScope" BOOLEAN NOT NULL DEFAULT true,
    "expectedQty" INTEGER NOT NULL DEFAULT 0,
    "baselineQty" INTEGER,
    "countedQty" INTEGER,
    "variance" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "finding" TEXT,
    "notes" TEXT,
    "countStartedById" TEXT,
    "countStartedByName" TEXT,
    "countStartedAt" TIMESTAMP(3),
    "countedById" TEXT,
    "countedByName" TEXT,
    "countedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchStockAuditItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchStockAudit_activeBranchId_key"
  ON "public"."BranchStockAudit"("activeBranchId");
CREATE INDEX "BranchStockAudit_branchId_startedAt_idx"
  ON "public"."BranchStockAudit"("branchId", "startedAt");
CREATE INDEX "BranchStockAudit_status_startedAt_idx"
  ON "public"."BranchStockAudit"("status", "startedAt");
CREATE INDEX "BranchStockAuditItem_auditId_inScope_status_idx"
  ON "public"."BranchStockAuditItem"("auditId", "inScope", "status");
CREATE INDEX "BranchStockAuditItem_auditId_productNameSnapshot_idx"
  ON "public"."BranchStockAuditItem"("auditId", "productNameSnapshot");
CREATE UNIQUE INDEX "BranchStockAuditItem_auditId_productId_key"
  ON "public"."BranchStockAuditItem"("auditId", "productId");

ALTER TABLE "public"."BranchStockAudit"
  ADD CONSTRAINT "BranchStockAudit_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."BranchStockAuditItem"
  ADD CONSTRAINT "BranchStockAuditItem_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "public"."BranchStockAudit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
