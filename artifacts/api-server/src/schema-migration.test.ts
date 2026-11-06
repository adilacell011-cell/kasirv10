import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
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
