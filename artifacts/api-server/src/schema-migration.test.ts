import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  assertCompatibleSchema,
  assertExactModelTablesAndColumns,
  type SchemaSnapshot,
} from "./database-readiness";
import type { DatabaseTarget } from "./database-target";
import {
  approveSchemaMigrationCheck,
  approveStagingSchemaMigration,
} from "./schema-migration";

const qaTarget: DatabaseTarget = {
  environment: "test",
  host: "127.0.0.1",
  port: "5432",
  database: "kasirv10_migration_qa",
  schema: "public",
};
const qaEnv = {
  STAGING_SCHEMA_INIT_TARGET: "test:127.0.0.1:5432/kasirv10_migration_qa/public",
};
const qaApproval = [
  "--execute",
  "--approve=schema-migrate:test:127.0.0.1:5432/kasirv10_migration_qa/public",
];
const migrasiTarget: DatabaseTarget = {
  environment: "production",
  host: "kasirv10-staging-db",
  port: "5432",
  database: "kasirv10_migrasi",
  schema: "public",
};
const migrasiEnv = {
  STAGING_SCHEMA_INIT_TARGET: "production:kasirv10-staging-db:5432/kasirv10_migrasi/public",
};
const migrasiCheckApproval = [
  "--check",
  "--approve=schema-check:production:kasirv10-staging-db:5432/kasirv10_migrasi/public",
];

test("legacy migration requires explicit execution and exact staging/QA target approval", () => {
  assert.doesNotThrow(() => approveStagingSchemaMigration(qaApproval, qaTarget, qaEnv));
  assert.doesNotThrow(() => approveStagingSchemaMigration(["--", ...qaApproval], qaTarget, qaEnv));
  assert.throws(() => approveStagingSchemaMigration([], qaTarget, qaEnv));
  assert.throws(() => approveStagingSchemaMigration(
    ["--execute", "--approve=schema-migrate:test:127.0.0.1:5432/other/public"],
    qaTarget,
    qaEnv,
  ));
  assert.throws(() => approveStagingSchemaMigration(
    qaApproval,
    { ...qaTarget, database: "kasirv10" },
    { STAGING_SCHEMA_INIT_TARGET: "test:127.0.0.1:5432/kasirv10/public" },
  ));
  assert.throws(() => approveStagingSchemaMigration(
    qaApproval,
    { ...qaTarget, host: "production-db" },
    { STAGING_SCHEMA_INIT_TARGET: "test:production-db:5432/kasirv10_migration_qa/public" },
  ));
});

test("kasirv10_migrasi is allowed only as the exact VPS target", () => {
  assert.doesNotThrow(() => approveStagingSchemaMigration([
    "--execute",
    "--approve=schema-migrate:production:kasirv10-staging-db:5432/kasirv10_migrasi/public",
  ], migrasiTarget, migrasiEnv));
  assert.doesNotThrow(() => approveSchemaMigrationCheck(migrasiCheckApproval, migrasiTarget, migrasiEnv));
  assert.throws(() => approveSchemaMigrationCheck([
    ...migrasiCheckApproval,
    "--execute",
  ], migrasiTarget, migrasiEnv));
  assert.throws(() => approveSchemaMigrationCheck(migrasiCheckApproval, {
    ...migrasiTarget,
    host: "another-postgres",
  }, {
    STAGING_SCHEMA_INIT_TARGET: "production:another-postgres:5432/kasirv10_migrasi/public",
  }));
  assert.throws(() => approveSchemaMigrationCheck(migrasiCheckApproval, {
    ...migrasiTarget,
    database: "kasirv10_staging",
  }, {
    STAGING_SCHEMA_INIT_TARGET: "production:kasirv10-staging-db:5432/kasirv10_staging/public",
  }));
  assert.throws(() => approveSchemaMigrationCheck(migrasiCheckApproval, migrasiTarget, {}));
});

test("read-only schema preflight exits before every Prisma migration command", () => {
  const main = fs.readFileSync(new URL("./schema-migration-main.ts", import.meta.url), "utf8");
  const checkBranch = main.indexOf("if (checkOnly) {", main.indexOf("const isLegacy14"));
  const firstMigrationCommand = main.indexOf('prismaCli, "migrate", "resolve"');
  assert.ok(checkBranch >= 0);
  assert.ok(firstMigrationCommand > checkBranch);
  assert.match(main.slice(checkBranch, firstMigrationCommand), /No changes performed[\s\S]*?return;/);
});

test("legacy migration SQL is additive and gated to a staging/QA schema", () => {
  const sql = fs.readFileSync(
    new URL("../prisma/migrations/20261106120000_add_branch_stock_audit_tables/migration.sql", import.meta.url),
    "utf8",
  );
  const entrypoint = fs.readFileSync(new URL("../docker-entrypoint.sh", import.meta.url), "utf8");
  assert.match(sql, /current_database\(\).*staging.*qa.*test/is);
  assert.match(sql, /current_database\(\)\s*<>\s*'kasirv10_migrasi'/);
  assert.match(sql, /BranchStockAudit/);
  assert.match(sql, /BranchStockAuditItem/);
  assert.match(sql, /ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.match(sql, /BranchStockAuditItem_auditId_productId_key/);
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.doesNotMatch(entrypoint, /schema-migration-main|migrate deploy/i);
});

test("staging Compose pins schema-init and API to the same immutable candidate image", () => {
  const compose = fs.readFileSync(new URL("../../../compose.staging.yaml", import.meta.url), "utf8");
  const schemaInitSection = compose.match(/schema-init:([\s\S]*?)\n\s+api:/)?.[1];
  const schemaInit = compose.match(/schema-init:[\s\S]*?\n\s+image:\s+"([^"]+)"/)?.[1];
  const api = compose.match(/\n\s+api:[\s\S]*?\n\s+image:\s+"([^"]+)"/)?.[1];
  const web = compose.match(/\n\s+web:[\s\S]*?\n\s+image:\s+"([^"]+)"/)?.[1];
  assert.ok(schemaInitSection);
  assert.ok(schemaInit);
  assert.ok(api);
  assert.ok(web);
  assert.equal(schemaInit, api);
  const candidateTag = /:candidate-[a-f0-9]{40}-run-\d+-attempt-\d+$/;
  assert.match(schemaInit, candidateTag);
  assert.match(web, candidateTag);
  assert.equal(schemaInit.split(":").at(-1), web.split(":").at(-1));
  assert.match(schemaInitSection, /NODE_ENV: production/);
  assert.match(schemaInitSection, /DB_RUNTIME_ENV: production/);
  assert.match(schemaInitSection, /DATABASE_URL:/);
  assert.match(schemaInitSection, /DB_EXPECTED_HOST: db/);
  assert.match(schemaInitSection, /DB_EXPECTED_NAME: kasirv10_staging/);
  assert.match(schemaInitSection, /DB_EXPECTED_PORT: "5432"/);
  assert.match(schemaInitSection, /DB_EXPECTED_SCHEMA: public/);
  assert.match(schemaInitSection, /STAGING_SCHEMA_INIT_TARGET: "production:db:5432\/kasirv10_staging\/public"/);
  assert.match(schemaInitSection, /schema-migration-main\.mjs/);
  assert.match(schemaInitSection, /--execute/);
  assert.match(schemaInitSection, /--approve=schema-migrate:production:db:5432\/kasirv10_staging\/public/);
  assert.match(schemaInitSection, /condition: service_healthy/);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.match(compose, /KASIRV10_STAGING_WEB_PORT:-18081/);
  assert.match(compose, /127\.0\.0\.1:18082:8080/);
});

test("migrasi app Compose uses the existing database server and does not initialize schema", () => {
  const compose = fs.readFileSync(new URL("../../../compose.migrasi.yaml", import.meta.url), "utf8");
  assert.match(compose, /kasirv10-staging-db:5432\/kasirv10_migrasi/);
  assert.match(compose, /DB_EXPECTED_HOST: kasirv10-staging-db/);
  assert.match(compose, /DB_EXPECTED_NAME: kasirv10_migrasi/);
  assert.match(compose, /name: kasirv10-staging-net/);
  assert.match(compose, /external: true/);
  assert.doesNotMatch(compose, /^\s{2}(db|schema-init):\s*$/m);
});

test("legacy baseline validates the full 15-model structure before it can be marked applied", () => {
  const legacyNames = new Set([
    "User", "Branch", "Product", "ProductStock", "VoucherSN", "Sale",
    "SaleIdempotency", "SaleItem", "Commission", "Adjustment", "GlobalConfig",
    "Shift", "StockSnapshot", "DailyIncomeSummary", "ShoppingPlan",
  ]);
  const legacyModels = Prisma.dmmf.datamodel.models.filter((model) => legacyNames.has(model.name));
  assert.equal(legacyModels.length, 15);
  const scalarTypes: Record<string, string> = {
    String: "text", Int: "int4", Float: "float8", Boolean: "bool",
    DateTime: "timestamp", Json: "jsonb", BigInt: "int8", Decimal: "numeric", Bytes: "bytea",
  };
  const snapshot: SchemaSnapshot = {
    database_name: "kasirv10_migration_qa",
    tables: legacyModels.map((model) => model.dbName || model.name),
    columns: legacyModels.flatMap((model) => model.fields
      .filter((field) => field.kind === "scalar")
      .map((field) => ({
        table_name: model.dbName || model.name,
        column_name: field.dbName || field.name,
        udt_name: scalarTypes[field.type],
        is_nullable: field.isRequired ? "NO" : "YES",
      }))),
    indexes: legacyModels.flatMap((model) => {
      const table = model.dbName || model.name;
      const keys = [
        ...model.fields.filter((field) => field.isId || field.isUnique)
          .map((field) => [field.dbName || field.name]),
        ...model.uniqueFields.map((fields) => fields.map((name) => {
          const field = model.fields.find((candidate) => candidate.name === name)!;
          return field.dbName || field.name;
        })),
      ];
      return keys.map((columns) => ({ table_name: table, columns, is_unique: true }));
    }),
    foreign_keys: legacyModels.flatMap((model) => model.fields
      .filter((field) => field.kind === "object" && field.relationFromFields?.length)
      .map((field) => {
        const referenced = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === field.type)!;
        const mapFields = (source: typeof model, names: readonly string[]) => names.map((name) => {
          const candidate = source.fields.find((field) => field.name === name)!;
          return candidate.dbName || candidate.name;
        });
        const deletion = field.relationOnDelete || (field.isRequired ? "Restrict" : "SetNull");
        const actions: Record<string, string> = { Restrict: "r", SetNull: "n", Cascade: "c", NoAction: "a", SetDefault: "d" };
        return {
          table_name: model.dbName || model.name,
          columns: mapFields(model, field.relationFromFields!),
          target_table: referenced.dbName || referenced.name,
          target_schema: "public",
          target_columns: mapFields(referenced, field.relationToFields!),
          delete_action: actions[deletion],
          update_action: "c",
        };
      })),
  };
  const target: DatabaseTarget = {
    environment: "test",
    host: "127.0.0.1",
    port: "5432",
    database: "kasirv10_migration_qa",
    schema: "public",
  };
  const legacyIndexes = [
    { table: "Sale", columns: ["branchId", "status", "createdAt"] },
    { table: "Sale", columns: ["status", "createdAt"] },
    { table: "Sale", columns: ["createdAt", "id"] },
    { table: "SaleIdempotency", columns: ["state", "createdAt"] },
  ];
  snapshot.indexes.push(...legacyIndexes.map((index) => ({
    table_name: index.table,
    columns: index.columns,
    is_unique: false,
  })));
  assert.doesNotThrow(() => assertCompatibleSchema(snapshot, target, legacyModels, legacyIndexes));

  const wrongColumn = structuredClone(snapshot);
  wrongColumn.columns.find((column) => column.table_name === "Branch" && column.column_name === "name")!.udt_name = "int4";
  assert.throws(() => assertCompatibleSchema(wrongColumn, target, legacyModels, legacyIndexes), /wrong type\/nullability/);

  const missingUnique = structuredClone(snapshot);
  missingUnique.indexes = missingUnique.indexes.filter((index) => !(index.table_name === "ProductStock" && index.columns.join(",") === "productId,branchId"));
  assert.throws(() => assertCompatibleSchema(missingUnique, target, legacyModels, legacyIndexes), /missing unique key/);

  const wrongRelation = structuredClone(snapshot);
  wrongRelation.foreign_keys[0].delete_action = "c";
  assert.throws(() => assertCompatibleSchema(wrongRelation, target, legacyModels, legacyIndexes), /incompatible relation/);

  const missingReadIndex = structuredClone(snapshot);
  missingReadIndex.indexes = missingReadIndex.indexes.filter((index) =>
    !(index.table_name === "Sale" && index.columns.join(",") === "createdAt,id"));
  assert.throws(
    () => assertCompatibleSchema(missingReadIndex, target, legacyModels, legacyIndexes),
    /missing or incompatible index/,
  );
});

test("legacy 14-table preflight rejects unexpected tables and columns", () => {
  const legacy14Names = new Set([
    "User", "Branch", "Product", "ProductStock", "VoucherSN", "Sale", "SaleItem",
    "Commission", "Adjustment", "GlobalConfig", "Shift", "StockSnapshot",
    "DailyIncomeSummary", "ShoppingPlan",
  ]);
  const legacy14Models = Prisma.dmmf.datamodel.models
    .filter((model) => legacy14Names.has(model.name))
    .map((model) => model.name === "Sale"
      ? {
          ...model,
          fields: model.fields.filter(
            (field) => !["idempotencyKeyHash", "idempotencyPayloadHash", "idempotencyRecord"].includes(field.name),
          ),
        }
      : model);
  const snapshot: SchemaSnapshot = {
    database_name: "kasirv10_migration_qa",
    tables: legacy14Models.map((model) => model.dbName || model.name),
    columns: legacy14Models.flatMap((model) => model.fields
      .filter((field) => field.kind === "scalar")
      .map((field) => ({
        table_name: model.dbName || model.name,
        column_name: field.dbName || field.name,
        udt_name: "text",
        is_nullable: field.isRequired ? "NO" : "YES",
      }))),
    indexes: [],
    foreign_keys: [],
  };
  assert.doesNotThrow(() => assertExactModelTablesAndColumns(snapshot, legacy14Models));

  const withExtraTable = structuredClone(snapshot);
  withExtraTable.tables.push("UnexpectedTable");
  assert.throws(() => assertExactModelTablesAndColumns(withExtraTable, legacy14Models), /unexpected/);

  const withExtraSaleColumn = structuredClone(snapshot);
  withExtraSaleColumn.columns.push({
    table_name: "Sale", column_name: "idempotencyKeyHash", udt_name: "text", is_nullable: "YES",
  });
  assert.throws(() => assertExactModelTablesAndColumns(withExtraSaleColumn, legacy14Models), /unexpected/);
});

test("legacy 14-to-15 migration is guarded and strictly additive", () => {
  const sql = fs.readFileSync(
    new URL("../prisma/migrations/20261106105000_upgrade_legacy14_sale_idempotency/migration.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /SaleIdempotency/);
  assert.match(sql, /idempotencyKeyHash/);
  assert.match(sql, /idempotencyPayloadHash/);
  assert.match(sql, /ON DELETE SET NULL ON UPDATE CASCADE/);
  assert.match(sql, /Sale_createdAt_id_idx/);
  assert.match(sql, /ix\.indnkeyatts = 2/);
  assert.match(sql, /indexed_column\.attname/);
  assert.match(sql, /current_database\(\).*staging.*qa.*test/is);
  assert.match(sql, /current_database\(\)\s*<>\s*'kasirv10_migrasi'/);
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
});

test("stock-transfer migration is guarded, additive, and retains transfer history", () => {
  const sql = fs.readFileSync(
    new URL("../prisma/migrations/20261112090000_add_stock_transfer_workflow/migration.sql", import.meta.url),
    "utf8",
  );
  const main = fs.readFileSync(new URL("./schema-migration-main.ts", import.meta.url), "utf8");
  assert.match(sql, /current_database\(\).*staging.*qa.*test/is);
  assert.match(sql, /current_database\(\)\s*<>\s*'kasirv10_migrasi'/);
  assert.match(sql, /expected the approved 17-table schema/);
  assert.match(sql, /CREATE TABLE "public"\."StockTransfer"/);
  for (const field of [
    "productId", "sourceBranchId", "targetBranchId", "kind", "status",
    "requestedQty", "approvedQty", "dispatchedQty", "receivedQty",
    "requestedById", "acceptedById", "dispatchedById", "receivedById",
    "closedById", "discrepancyNote",
  ]) {
    assert.match(sql, new RegExp(`"${field}"`));
  }
  assert.match(sql, /StockTransfer_sourceBranchId_status_createdAt_idx/);
  assert.match(sql, /StockTransfer_targetBranchId_status_createdAt_idx/);
  assert.match(sql, /StockTransfer_productId_createdAt_idx/);
  assert.match(main, /STOCK_TRANSFER_MIGRATION/);
  assert.match(main, /STOCK_TRANSFER_SKU_CORRECTION_MIGRATION/);
  assert.match(main, /const PRE_TRANSFER_MODELS = Prisma\.dmmf\.datamodel\.models\s*\.filter\(\(model\) => model\.name !== "StockTransfer" && model\.name !== "StockTransferSkuCorrection"\)/);
  assert.match(main, /isCurrent17/);
  assert.match(main, /isCurrent18/);
  assert.match(main, /isCurrent19/);
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
});

test("transfer SKU-correction migration is guarded, additive, and preserves both SKU histories", () => {
  const sql = fs.readFileSync(
    new URL("../prisma/migrations/20261112100000_add_transfer_sku_corrections/migration.sql", import.meta.url),
    "utf8",
  );
  const main = fs.readFileSync(new URL("./schema-migration-main.ts", import.meta.url), "utf8");
  assert.match(sql, /current_database\(\).*staging.*qa.*test/is);
  assert.match(sql, /current_database\(\)\s*<>\s*'kasirv10_migrasi'/);
  assert.match(sql, /expected the approved 18-table transfer schema/);
  assert.match(sql, /CREATE TABLE "public"\."StockTransferSkuCorrection"/);
  for (const field of [
    "transferId", "actualProductId", "actualQty", "note", "status",
    "responseNote", "reportedById", "reviewedById", "receivedById",
  ]) {
    assert.match(sql, new RegExp(`"${field}"`));
  }
  assert.match(sql, /StockTransferSkuCorrection_one_open_per_transfer_idx/);
  assert.match(sql, /PENDING_SOURCE.*APPROVED_PENDING_RECEIPT/is);
  assert.match(sql, /StockTransferSkuCorrection_transferId_fkey/);
  assert.match(main, /STOCK_TRANSFER_SKU_CORRECTION_MIGRATION/);
  assert.match(main, /PRE_SKU_CORRECTION_MODELS/);
  assert.match(main, /isCurrent19/);
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
});

test("transfer-batch migration safely adds a grouping key to the exact current schema", () => {
  const sql = fs.readFileSync(
    new URL("../prisma/migrations/20261112110000_add_stock_transfer_batch_id/migration.sql", import.meta.url),
    "utf8",
  );
  const main = fs.readFileSync(new URL("./schema-migration-main.ts", import.meta.url), "utf8");
  assert.match(sql, /current_database\(\).*staging.*qa.*test/is);
  assert.match(sql, /current_database\(\)\s*<>\s*'kasirv10_migrasi'/);
  assert.match(sql, /exact approved 19-table schema/i);
  assert.match(sql, /ALTER TABLE "public"\."StockTransfer"\s+ADD COLUMN "batchId" TEXT/i);
  assert.match(sql, /StockTransfer_batchId_createdAt_idx/);
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.match(main, /STOCK_TRANSFER_BATCH_MIGRATION/);
  assert.match(main, /PRE_BATCH_MODELS/);
  assert.match(main, /hasTransferBatchColumn/);
  assert.match(main, /isPreBatch19/);
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
});
