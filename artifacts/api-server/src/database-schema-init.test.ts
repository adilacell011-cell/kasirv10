import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  approveSchemaInitialization,
  assertSchemaIsEmpty,
  getSchemaInitializationState,
} from "./database-schema-init";
import { assertComposeSchemaInitTarget, type DatabaseTarget } from "./database-target";

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

test("Compose automatic initialization requires a canonical local database and exact target", () => {
  const composeTarget: DatabaseTarget = {
    environment: "production",
    host: "db",
    port: "5432",
    database: "kasirv10",
    schema: "public",
  };
  assert.doesNotThrow(() => assertComposeSchemaInitTarget(composeTarget, {
    SCHEMA_INIT_AUTO_TARGET: "production:db:5432/kasirv10/public",
  }));
  for (const unsafeTarget of [
    { ...composeTarget, host: "zetas-db" },
    { ...composeTarget, database: "zetas" },
    { ...composeTarget, schema: "private" },
    { ...composeTarget, port: "6432" },
  ]) {
    assert.throws(() => assertComposeSchemaInitTarget(unsafeTarget, {
      SCHEMA_INIT_AUTO_TARGET:
        `${unsafeTarget.environment}:${unsafeTarget.host}:${unsafeTarget.port}/${unsafeTarget.database}/${unsafeTarget.schema}`,
    }));
  }
  assert.throws(() => assertComposeSchemaInitTarget(composeTarget, {
    SCHEMA_INIT_AUTO_TARGET: "production:db:5432/kasirv10_staging/public",
  }));
  assert.doesNotThrow(() => assertComposeSchemaInitTarget({
    ...target,
    database: "kasirv10_schema_init_qa",
  }, {
    SCHEMA_INIT_AUTO_TARGET: "test:127.0.0.1:5432/kasirv10_schema_init_qa/public",
  }));
});

test("non-empty compatible schema is skipped and incomplete schema is rejected without DDL", async () => {
  const scalarTypes: Record<string, string> = {
    String: "text", Int: "int4", Float: "float8", Boolean: "bool",
    DateTime: "timestamp", Json: "jsonb", BigInt: "int8", Decimal: "numeric", Bytes: "bytea",
  };
  const compatibleSnapshot = {
    database_name: target.database,
    columns: Prisma.dmmf.datamodel.models.flatMap(model =>
      model.fields.filter(field => field.kind === "scalar").map(field => ({
        table_name: model.dbName || model.name,
        column_name: field.dbName || field.name,
        udt_name: scalarTypes[field.type]!,
        is_nullable: field.isRequired ? "NO" : "YES",
      }))),
    indexes: Prisma.dmmf.datamodel.models.flatMap(model => [
      ...model.fields.filter(field => field.isId || field.isUnique)
        .map(field => ({
          table_name: model.dbName || model.name,
          columns: [field.dbName || field.name],
          is_unique: true,
        })),
      ...model.uniqueFields.map(fields => ({
        table_name: model.dbName || model.name,
        is_unique: true,
        columns: fields.map(name => {
          const field = model.fields.find(candidate => candidate.name === name)!;
          return field.dbName || field.name;
        }),
      })),
    ]),
    foreign_keys: Prisma.dmmf.datamodel.models.flatMap(model =>
      model.fields.filter(field => field.kind === "object" && field.relationFromFields?.length).map(field => {
        const referenced = Prisma.dmmf.datamodel.models.find(candidate => candidate.name === field.type)!;
        const deletion = field.relationOnDelete || (field.isRequired ? "Restrict" : "SetNull");
        return {
          table_name: model.dbName || model.name,
          columns: field.relationFromFields!.map(name => {
            const column = model.fields.find(candidate => candidate.name === name)!;
            return column.dbName || column.name;
          }),
          target_table: referenced.dbName || referenced.name,
          target_schema: "public",
          target_columns: field.relationToFields!.map(name => {
            const column = referenced.fields.find(candidate => candidate.name === name)!;
            return column.dbName || column.name;
          }),
          delete_action: ({ Restrict: "r", SetNull: "n", Cascade: "c", NoAction: "a", SetDefault: "d" } as Record<string, string>)[deletion],
          update_action: "c",
        };
      })),
  };
  const catalog = {
    database_name: target.database,
    schema_exists: true,
    relation_count: 1,
    routine_count: 0,
    custom_type_count: 0,
  };
  const fakeClient = (snapshot: typeof compatibleSnapshot) => {
    let call = 0;
    return {
      $queryRaw: async () => {
        call++;
        return call === 1 ? [catalog] : [snapshot];
      },
    } as unknown as Parameters<typeof getSchemaInitializationState>[0];
  };
  assert.equal(await getSchemaInitializationState(fakeClient(compatibleSnapshot), target), "compatible");

  const incomplete = { ...compatibleSnapshot, columns: [] };
  const partialClient = fakeClient(incomplete);
  await assert.rejects(
    getSchemaInitializationState(partialClient, target),
    /non-empty but incomplete or incompatible; no schema changes were made/,
  );
});

test("Compose services initialize before API and API performs a read-only schema check", () => {
  const staging = fs.readFileSync(new URL("../../../compose.staging.yaml", import.meta.url), "utf8");
  const regular = fs.readFileSync(new URL("../../../compose.dockge.yaml", import.meta.url), "utf8");
  const local = fs.readFileSync(new URL("../../../docker-compose.yml", import.meta.url), "utf8");
  for (const compose of [staging, regular, local]) {
    assert.match(compose, /schema-init:/);
    assert.match(compose, /service_completed_successfully/);
  }
  for (const compose of [regular, local]) {
    assert.match(compose, /SCHEMA_INIT_AUTO_TARGET:/);
    assert.match(compose, /--compose-auto-if-empty/);
  }
  assert.match(staging, /STAGING_SCHEMA_INIT_TARGET:/);
  assert.match(staging, /--approve=schema-migrate:/);
  assert.doesNotMatch(staging, /--compose-auto-if-empty/);

  const entrypoint = fs.readFileSync(new URL("../docker-entrypoint.sh", import.meta.url), "utf8");
  assert.match(entrypoint, /dist\/database-check-cli\.mjs/);
  assert.ok(entrypoint.indexOf("database-check-cli.mjs") < entrypoint.indexOf("dist/index.mjs"));
});

test("db:push cannot bypass the guarded schema initialization command", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["db:push"], packageJson.scripts["db:init-schema"]);
  assert.equal(packageJson.scripts["db:init-schema"], "tsx src/schema-init-main.ts");
  assert.doesNotMatch(packageJson.scripts["db:push"], /prisma\s+db\s+push/);
});
