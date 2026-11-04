import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  approveSchemaInitialization,
  assertSchemaIsEmpty,
} from "./database-schema-init";
import type { DatabaseTarget } from "./database-target";

const target: DatabaseTarget = {
  environment: "test",
  host: "127.0.0.1",
  port: "5432",
  database: "kasirv10_schema_init_qa",
  schema: "public",
};
const env = {
  STAGING_SCHEMA_INIT_TARGET: "test:127.0.0.1:5432/kasirv10_schema_init_qa/public",
};
const approval = [
  "--execute",
  "--acknowledge-empty-schema",
  "--approve=schema-init:test:127.0.0.1:5432/kasirv10_schema_init_qa/public",
];

test("schema initialization requires an exact staging/QA allowlist and explicit approval", () => {
  assert.doesNotThrow(() => approveSchemaInitialization(approval, target, env));
  assert.throws(() => approveSchemaInitialization([], target, env));
  assert.throws(() => approveSchemaInitialization(approval, target, {}));
  assert.throws(() => approveSchemaInitialization(
    approval,
    { ...target, database: "kasirv10" },
    { STAGING_SCHEMA_INIT_TARGET: "test:127.0.0.1:5432/kasirv10/public" },
  ));
  assert.throws(() => approveSchemaInitialization(
    approval,
    { ...target, host: "production-db" },
    { STAGING_SCHEMA_INIT_TARGET: "test:production-db:5432/kasirv10_schema_init_qa/public" },
  ));
  assert.throws(() => approveSchemaInitialization(
    approval,
    { ...target, schema: "other" },
    { STAGING_SCHEMA_INIT_TARGET: "test:127.0.0.1:5432/kasirv10_schema_init_qa/other" },
  ));
  assert.throws(() => approveSchemaInitialization(
    approval,
    { ...target, environment: "development" },
    { STAGING_SCHEMA_INIT_TARGET: "development:127.0.0.1:5432/kasirv10_schema_init_qa/public" },
  ));
  const productionTarget: DatabaseTarget = {
    environment: "production",
    host: "db",
    port: "5432",
    database: "kasirv10_staging",
    schema: "public",
  };
  const productionApproval = [
    "--execute",
    "--acknowledge-empty-schema",
    "--approve=schema-init:production:db:5432/kasirv10_staging/public",
  ];
  assert.doesNotThrow(() => approveSchemaInitialization(
    productionApproval,
    productionTarget,
    { STAGING_SCHEMA_INIT_TARGET: "production:db:5432/kasirv10_staging/public" },
  ));
  assert.throws(() => approveSchemaInitialization(
    productionApproval,
    { ...productionTarget, host: "production-db" },
    { STAGING_SCHEMA_INIT_TARGET: "production:production-db:5432/kasirv10_staging/public" },
  ));
  assert.throws(() => approveSchemaInitialization(
    productionApproval,
    { ...productionTarget, database: "kasirv10" },
    { STAGING_SCHEMA_INIT_TARGET: "production:db:5432/kasirv10/public" },
  ));
  assert.throws(() => approveSchemaInitialization(
    approval,
    { ...target, host: "remote-db" },
    { STAGING_SCHEMA_INIT_TARGET: "test:remote-db:5432/kasirv10_schema_init_qa/public" },
  ));
});

test("schema initialization refuses any pre-existing relation, routine, or custom type", async () => {
  const empty = {
    database_name: target.database,
    schema_exists: true,
    relation_count: 0,
    routine_count: 0,
    custom_type_count: 0,
  };
  const client = (row: typeof empty) => ({
    $queryRaw: async () => [row],
  }) as unknown as Parameters<typeof assertSchemaIsEmpty>[0];

  await assert.doesNotReject(assertSchemaIsEmpty(client(empty), target));
  for (const patch of [
    { relation_count: 1 },
    { routine_count: 1 },
    { custom_type_count: 1 },
    { database_name: "other_database" },
    { schema_exists: false },
  ]) {
    await assert.rejects(assertSchemaIsEmpty(client({ ...empty, ...patch }), target));
  }
});

test("schema initialization allowlist exists only on the isolated staging Compose", () => {
  const staging = fs.readFileSync(new URL("../../../compose.staging.yaml", import.meta.url), "utf8");
  const regular = fs.readFileSync(new URL("../../../compose.dockge.yaml", import.meta.url), "utf8");
  assert.match(staging, /STAGING_SCHEMA_INIT_TARGET:\s*"production:db:5432\/kasirv10_staging\/public"/);
  assert.doesNotMatch(regular, /STAGING_SCHEMA_INIT_TARGET/);
});

test("db:push cannot bypass the guarded schema initialization command", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["db:push"], packageJson.scripts["db:init-schema"]);
  assert.equal(packageJson.scripts["db:init-schema"], "tsx src/schema-init-main.ts");
  assert.doesNotMatch(packageJson.scripts["db:push"], /prisma\s+db\s+push/);
});
