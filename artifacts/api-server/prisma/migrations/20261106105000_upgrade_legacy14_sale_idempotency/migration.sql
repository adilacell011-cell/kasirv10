BEGIN;

DO $legacy14_migration_guard$
DECLARE
  has_idempotency_table boolean;
  has_key_column boolean;
  has_payload_column boolean;
  has_created_at_index boolean;
  legacy_tables text[];
  expected_legacy_tables constant text[] := ARRAY[
    'Adjustment', 'Branch', 'Commission', 'DailyIncomeSummary', 'GlobalConfig',
    'Product', 'ProductStock', 'Sale', 'SaleItem', 'Shift', 'ShoppingPlan',
    'StockSnapshot', 'User', 'VoucherSN'
  ];
  required_legacy_tables text[];
BEGIN
  IF current_database() !~* '(^|[_-])(staging|stage|qa|test)([_-]|$)'
     AND current_database() <> 'kasirv10_migrasi' THEN
    RAISE EXCEPTION 'Refusing legacy 14-table upgrade outside a staging/QA/test database.';
  END IF;

  SELECT to_regclass('public."SaleIdempotency"') IS NOT NULL
    INTO has_idempotency_table;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'Sale'
       AND column_name = 'idempotencyKeyHash' AND udt_name = 'text' AND is_nullable = 'YES'
  ) INTO has_key_column;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'Sale'
       AND column_name = 'idempotencyPayloadHash' AND udt_name = 'text' AND is_nullable = 'YES'
  ) INTO has_payload_column;
  SELECT EXISTS (
    SELECT 1 FROM pg_index ix
      JOIN pg_class tbl ON tbl.oid = ix.indrelid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      JOIN pg_attribute a1 ON a1.attrelid = tbl.oid AND a1.attname = 'createdAt'
      JOIN pg_attribute a2 ON a2.attrelid = tbl.oid AND a2.attname = 'id'
     WHERE ns.nspname = 'public' AND tbl.relname = 'Sale'
       AND ix.indisvalid AND NOT ix.indisunique
        AND ix.indnkeyatts = 2
        AND ARRAY(
          SELECT indexed_column.attname::text
            FROM unnest(ix.indkey::smallint[]) WITH ORDINALITY AS key(attnum, ordinal)
            JOIN pg_attribute indexed_column
              ON indexed_column.attrelid = tbl.oid AND indexed_column.attnum = key.attnum
           WHERE key.ordinal <= ix.indnkeyatts
           ORDER BY key.ordinal
        ) = ARRAY['createdAt', 'id']::text[]
  ) INTO has_created_at_index;

  IF has_idempotency_table AND has_key_column AND has_payload_column AND has_created_at_index THEN
    IF to_regclass('public."Sale_idempotencyKeyHash_key"') IS NULL
       OR to_regclass('public."SaleIdempotency_scopeKeyHash_key"') IS NULL
       OR to_regclass('public."SaleIdempotency_saleId_key"') IS NULL
       OR to_regclass('public."SaleIdempotency_state_createdAt_idx"') IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM pg_constraint c
          WHERE c.conrelid = 'public."SaleIdempotency"'::regclass
            AND c.conname = 'SaleIdempotency_saleId_fkey'
            AND c.contype = 'f' AND c.confdeltype = 'n' AND c.confupdtype = 'c'
       ) THEN
      RAISE EXCEPTION 'Refusing legacy upgrade: existing Sale idempotency schema is partial or incompatible.';
    END IF;
    RETURN;
  END IF;

  IF has_idempotency_table OR has_key_column OR has_payload_column OR has_created_at_index
     OR to_regclass('public."Sale_idempotencyKeyHash_key"') IS NOT NULL
     OR to_regclass('public."SaleIdempotency_scopeKeyHash_key"') IS NOT NULL
     OR to_regclass('public."SaleIdempotency_saleId_key"') IS NOT NULL
     OR to_regclass('public."SaleIdempotency_state_createdAt_idx"') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing legacy upgrade: partial Sale idempotency objects exist.';
  END IF;

  SELECT array_agg(required.table_name ORDER BY required.table_name)
    INTO required_legacy_tables
    FROM unnest(expected_legacy_tables) AS required(table_name)
   WHERE to_regclass(format('%I.%I', 'public', required.table_name)) IS NULL;
  IF required_legacy_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing legacy upgrade: required legacy tables are missing: %.',
      array_to_string(required_legacy_tables, ', ');
  END IF;

  SELECT array_agg(t.tablename ORDER BY t.tablename)
    INTO legacy_tables
    FROM pg_tables t
   WHERE t.schemaname = 'public' AND t.tablename <> '_prisma_migrations';
  IF legacy_tables IS DISTINCT FROM expected_legacy_tables THEN
    RAISE EXCEPTION 'Refusing legacy upgrade: the public table set is not the approved 14-table baseline.';
  END IF;

  IF to_regclass('public."BranchStockAudit"') IS NOT NULL
     OR to_regclass('public."BranchStockAuditItem"') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing legacy upgrade: Audit Stok tables exist without the current schema history.';
  END IF;

  ALTER TABLE public."Sale"
    ADD COLUMN "idempotencyKeyHash" TEXT,
    ADD COLUMN "idempotencyPayloadHash" TEXT;

  CREATE TABLE public."SaleIdempotency" (
    "id" TEXT NOT NULL,
    "scopeKeyHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "saleId" TEXT,
    "originalSaleId" TEXT,
    "resultSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "SaleIdempotency_pkey" PRIMARY KEY ("id")
  );

  CREATE UNIQUE INDEX "Sale_idempotencyKeyHash_key"
    ON public."Sale"("idempotencyKeyHash");
  CREATE UNIQUE INDEX "SaleIdempotency_scopeKeyHash_key"
    ON public."SaleIdempotency"("scopeKeyHash");
  CREATE UNIQUE INDEX "SaleIdempotency_saleId_key"
    ON public."SaleIdempotency"("saleId");
  CREATE INDEX "SaleIdempotency_state_createdAt_idx"
    ON public."SaleIdempotency"("state", "createdAt");
  CREATE INDEX "Sale_createdAt_id_idx"
    ON public."Sale"("createdAt", "id");

  ALTER TABLE public."SaleIdempotency"
    ADD CONSTRAINT "SaleIdempotency_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES public."Sale"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
END
$legacy14_migration_guard$;

COMMIT;
