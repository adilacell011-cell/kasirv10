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
    RAISE EXCEPTION 'Refusing shopping-plan receipt migration outside an approved staging/QA database.';
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
       'Commission', 'DailyIncomeSummary', 'DailyProductSalesSummary',
       'GlobalConfig', 'Product', 'ProductSalesSummaryEvent', 'ProductStock',
       'Sale', 'SaleIdempotency', 'SaleItem', 'Shift', 'ShoppingPlan',
       'StockSnapshot', 'StockTransfer', 'StockTransferSkuCorrection', 'User',
       'VoucherSN'
     );

  IF table_count <> 21
     OR unexpected_tables IS NOT NULL
     OR application_tables IS DISTINCT FROM ARRAY[
       'Adjustment', 'Branch', 'BranchStockAudit', 'BranchStockAuditItem',
       'Commission', 'DailyIncomeSummary', 'DailyProductSalesSummary',
       'GlobalConfig', 'Product', 'ProductSalesSummaryEvent', 'ProductStock',
       'Sale', 'SaleIdempotency', 'SaleItem', 'Shift', 'ShoppingPlan',
       'StockSnapshot', 'StockTransfer', 'StockTransferSkuCorrection', 'User',
       'VoucherSN'
     ]::text[] THEN
    RAISE EXCEPTION 'Refusing shopping-plan receipt migration: database is not the exact approved 21-table schema.';
  END IF;

  IF to_regclass('public."ShoppingPlanRevision"') IS NOT NULL
     OR to_regclass('public."ShoppingPlanReceipt"') IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'DailyProductSalesSummary'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ProductSalesSummaryEvent'
     ) THEN
    RAISE EXCEPTION 'Refusing shopping-plan receipt migration: prerequisite or target table state is unexpected.';
  END IF;
END
$migration_guard$;

CREATE TABLE "public"."ShoppingPlanRevision" (
  "id" TEXT NOT NULL,
  "shoppingPlanId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "title" TEXT,
  "items" JSONB NOT NULL,
  "creatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShoppingPlanRevision_revisionNumber_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "ShoppingPlanRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShoppingPlanRevision_shoppingPlanId_fkey"
    FOREIGN KEY ("shoppingPlanId") REFERENCES "public"."ShoppingPlan"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ShoppingPlanRevision_shoppingPlanId_revisionNumber_key"
    UNIQUE ("shoppingPlanId", "revisionNumber")
);

CREATE INDEX "ShoppingPlanRevision_shoppingPlanId_createdAt_idx"
  ON "public"."ShoppingPlanRevision"("shoppingPlanId", "createdAt");

CREATE TABLE "public"."ShoppingPlanReceipt" (
  "id" TEXT NOT NULL,
  "shoppingPlanId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "branchNameSnapshot" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "items" JSONB NOT NULL,
  "receivedById" TEXT,
  "receivedByNameSnapshot" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShoppingPlanReceipt_status_check"
    CHECK ("status" IN ('PENDING', 'CONFIRMED', 'SUPERSEDED', 'NO_ITEMS')),
  CONSTRAINT "ShoppingPlanReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShoppingPlanReceipt_shoppingPlanId_fkey"
    FOREIGN KEY ("shoppingPlanId") REFERENCES "public"."ShoppingPlan"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ShoppingPlanReceipt_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "public"."ShoppingPlanRevision"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ShoppingPlanReceipt_revisionId_branchId_key"
    UNIQUE ("revisionId", "branchId")
);

CREATE INDEX "ShoppingPlanReceipt_branchId_status_createdAt_idx"
  ON "public"."ShoppingPlanReceipt"("branchId", "status", "createdAt");

CREATE INDEX "ShoppingPlanReceipt_shoppingPlanId_branchId_createdAt_idx"
  ON "public"."ShoppingPlanReceipt"("shoppingPlanId", "branchId", "createdAt");

COMMIT;
