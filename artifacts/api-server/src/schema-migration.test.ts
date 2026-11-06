import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { assertCompatibleSchema, type SchemaSnapshot } from "./database-readiness";
import type { DatabaseTarget } from "./database-target";
import { approveStagingSchemaMigration } from "./schema-migration";

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

test("legacy migration SQL is additive and gated to a staging/QA schema", () => {
  const sql = fs.readFileSync(
    new URL("../prisma/migrations/20261106120000_add_branch_stock_audit_tables/migration.sql", import.meta.url),
    "utf8",
  );
  const entrypoint = fs.readFileSync(new URL("../docker-entrypoint.sh", import.meta.url), "utf8");
  assert.match(sql, /current_database\(\).*staging.*qa.*test/is);
  assert.match(sql, /BranchStockAudit/);
  assert.match(sql, /BranchStockAuditItem/);
  assert.match(sql, /ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.match(sql, /BranchStockAuditItem_auditId_productId_key/);
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.doesNotMatch(entrypoint, /schema-migration-main|migrate deploy/i);
});

test("staging Compose pins schema-init and API to the same immutable image expression", () => {
  const compose = fs.readFileSync(new URL("../../../compose.staging.yaml", import.meta.url), "utf8");
  const schemaInit = compose.match(/schema-init:[\s\S]*?\n\s+image:\s+"([^"]+)"/)?.[1];
  const api = compose.match(/\n\s+api:[\s\S]*?\n\s+image:\s+"([^"]+)"/)?.[1];
  assert.ok(schemaInit);
  assert.ok(api);
  assert.equal(schemaInit, api);
  assert.match(schemaInit, /KASIRV10_IMAGE_SHA/);
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
      return keys.map((columns) => ({ table_name: table, columns }));
    }),
    foreign_keys: legacyModels.flatMap((model) => model.fields
      .filter((field) => field.kind === "object" && field.relationFromFields?.length)
      .map((field) => {
        const referenced = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === field.type)!;
        const mapFields = (source: typeof model, names: string[]) => names.map((name) => {
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
  assert.doesNotThrow(() => assertCompatibleSchema(snapshot, target, legacyModels));

  const wrongColumn = structuredClone(snapshot);
  wrongColumn.columns.find((column) => column.table_name === "Branch" && column.column_name === "name")!.udt_name = "int4";
  assert.throws(() => assertCompatibleSchema(wrongColumn, target, legacyModels), /wrong type\/nullability/);

  const missingUnique = structuredClone(snapshot);
  missingUnique.indexes = missingUnique.indexes.filter((index) => !(index.table_name === "ProductStock" && index.columns.join(",") === "productId,branchId"));
  assert.throws(() => assertCompatibleSchema(missingUnique, target, legacyModels), /missing unique key/);

  const wrongRelation = structuredClone(snapshot);
  wrongRelation.foreign_keys[0].delete_action = "c";
  assert.throws(() => assertCompatibleSchema(wrongRelation, target, legacyModels), /incompatible relation/);
});
