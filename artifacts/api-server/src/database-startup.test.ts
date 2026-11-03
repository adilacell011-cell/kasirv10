import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { validateDatabaseTarget } from "./database-target";
import { approveMaintenance } from "./maintenance-cli";
import {
  assertCompatibleSchema, createReadiness, inspectDatabase, prepareDatabase, type SchemaSnapshot,
} from "./database-readiness";
import { getLogicalShiftDate } from "./business-date";
import { autoArchiveOldSales, backfillDailySummaries, syncCredentials } from "./maintenance-operations";

const development: NodeJS.ProcessEnv = {
  NODE_ENV: "development", DB_RUNTIME_ENV: "development",
  DATABASE_URL: "postgresql://test:never-print-this@dev-db:5432/isolated",
  PGHOST: "dev-db", PGDATABASE: "isolated", PGPORT: "5432",
};
const target = validateDatabaseTarget(development);
function snapshot(): SchemaSnapshot {
  const types: Record<string, string> = {
    String: "text", Int: "int4", Float: "float8", Boolean: "bool", DateTime: "timestamp", Json: "jsonb",
  };
  const result: SchemaSnapshot = { database_name: "isolated", columns: [], indexes: [], foreign_keys: [] };
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields.filter(f => f.kind === "scalar")) {
      result.columns.push({
        table_name: model.name, column_name: field.name,
        udt_name: types[field.type]!, is_nullable: field.isRequired ? "NO" : "YES",
      });
      if (field.isId || field.isUnique) result.indexes.push({ table_name: model.name, columns: [field.name] });
    }
    for (const fields of model.uniqueFields) result.indexes.push({ table_name: model.name, columns: [...fields] });
    for (const field of model.fields.filter(f => f.relationFromFields?.length)) {
      result.foreign_keys.push({
        table_name: model.name, columns: [...field.relationFromFields!],
        target_table: field.type, target_schema: "public", target_columns: [...field.relationToFields!],
        delete_action: field.relationOnDelete === "SetNull" || (!field.relationOnDelete && !field.isRequired) ? "n" : "r",
        update_action: "c",
      });
    }
  }
  return result;
}

test("development must match the independently configured PG target, not just NODE_ENV", () => {
  assert.equal(target.database, "isolated");
  for (const patch of [
    { DATABASE_URL: "postgresql://test:test@production.invalid/isolated" },
    { DATABASE_URL: "postgresql://test:test@dev-db/production" },
    { DATABASE_URL: "postgresql://test:test@dev-db:6432/isolated" },
    { PGHOST: undefined }, { DB_RUNTIME_ENV: undefined }, { NODE_ENV: "production" },
    { DB_EXPECTED_HOST: "another-db" }, { DB_EXPECTED_NAME: "another-db" },
  ]) assert.throws(() => validateDatabaseTarget({ ...development, ...patch }));
});
test("production needs explicit target configuration and matching environment", () => {
  const env = { ...development, NODE_ENV: "production", DB_RUNTIME_ENV: "production" };
  assert.throws(() => validateDatabaseTarget(env));
  assert.equal(validateDatabaseTarget({
    ...env, DB_EXPECTED_HOST: "dev-db", DB_EXPECTED_NAME: "isolated", DB_EXPECTED_PORT: "5432",
  }).environment, "production");
});
test("target overrides, duplicate parameters and invalid URLs are rejected without leaking credentials", () => {
  for (const suffix of ["?host=production.invalid", "?schema=other", "?schema=public&schema=other", "#fragment"]) {
    assert.throws(() => validateDatabaseTarget({ ...development, DATABASE_URL: development.DATABASE_URL + suffix }));
  }
  try { validateDatabaseTarget({ ...development, DATABASE_URL: "never-print-this" }); }
  catch (error) { assert.ok(!String(error).includes("never-print-this")); }
});
test("schema compatibility rejects missing fields, wrong types/nullability, uniqueness and FK behavior", () => {
  assert.doesNotThrow(() => assertCompatibleSchema(snapshot(), target));
  const mutations = [
    (s: SchemaSnapshot) => { s.database_name = "wrong"; },
    (s: SchemaSnapshot) => { s.columns = s.columns.filter(c => c.table_name !== "ShoppingPlan"); },
    (s: SchemaSnapshot) => { s.columns.find(c => c.table_name === "Commission" && c.column_name === "saleId")!.is_nullable = "NO"; },
    (s: SchemaSnapshot) => { s.columns.find(c => c.table_name === "ProductStock" && c.column_name === "qty")!.udt_name = "text"; },
    (s: SchemaSnapshot) => { s.indexes = s.indexes.filter(i => i.table_name !== "ProductStock"); },
    (s: SchemaSnapshot) => { s.foreign_keys.find(f => f.table_name === "Commission" && f.columns[0] === "saleId")!.delete_action = "r"; },
  ];
  for (const mutate of mutations) { const s = snapshot(); mutate(s); assert.throws(() => assertCompatibleSchema(s, target)); }
});
test("schema inspection executes SELECT only and has no mutation/maintenance dependency", async () => {
  let calls = 0;
  await inspectDatabase({
    $queryRaw: async (strings: TemplateStringsArray) => {
      calls++;
      const sql = strings.join("?");
      assert.match(sql.trim(), /^SELECT\b/);
      assert.doesNotMatch(sql, /\b(ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
      return [snapshot()];
    },
  } as any, target);
  assert.equal(calls, 1);
});
test("listen waits for connection and schema; failed prerequisites never listen", async () => {
  const events: string[] = [];
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const started = prepareDatabase(
    { $connect: async () => { events.push("connect"); } },
    async () => { events.push("verify"); await wait; },
    async () => { events.push("listen"); },
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ["connect", "verify"]);
  release(); await started;
  assert.deepEqual(events, ["connect", "verify", "listen"]);
  let listens = 0;
  for (const connectFails of [true, false]) {
    await assert.rejects(prepareDatabase({
      $connect: async () => { if (connectFails) throw Error("offline"); },
    }, async () => { throw Error("incompatible"); }, async () => { listens++; }));
  }
  assert.equal(listens, 0);
});
test("health and transaction gate return 503 on readiness failure and recover without writes", async () => {
  let online = true;
  let probes = 0;
  const ready = createReadiness(async () => { probes++; if (!online) throw Error("offline"); });
  let status = 200;
  let next = 0;
  const response = {
    status(code: number) { status = code; return this; },
    json() { return this; },
  } as unknown as Response;
  await ready.health({} as Request, response, () => {});
  assert.equal(status, 200);
  online = false;
  await ready.health({} as Request, response, () => {});
  assert.equal(status, 503);
  await ready.gate({} as Request, response, () => { next++; });
  assert.equal(next, 0);
  online = true;
  await ready.gate({} as Request, response, () => { next++; });
  assert.equal(next, 1);
  assert.equal(probes, 4);
});
test("administration requires action, execution, risk acknowledgement and exact target approval", () => {
  assert.throws(() => approveMaintenance(["archive"], target));
  assert.throws(() => approveMaintenance(["seed", "--execute"], target));
  const args = ["archive", "--execute", "--acknowledge-legacy-risks",
    "--approve=archive:development:dev-db:5432/isolated/public"];
  assert.equal(approveMaintenance(args, target), "archive");
  assert.throws(() => approveMaintenance(args, { ...target, database: "production" }));
  assert.throws(() => approveMaintenance(["backfill", ...args.slice(1)], target));
});
test("normal entrypoint and hooks have no DDL, maintenance calls or automatic schema push", () => {
  const api = fs.readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /executeRaw|CREATE TABLE|ALTER TABLE|maintenance-operations|syncCredentials|autoArchiveOldSales|backfillDailySummaries/);
  for (const path of ["../docker-entrypoint.sh", "../../../scripts/post-merge.sh"]) {
    assert.doesNotMatch(fs.readFileSync(new URL(path, import.meta.url), "utf8"), /prisma\s+db\s+push|--filter\s+db\s+push/);
  }
});
test("logical day remains WIB 06:00, including the 06:00–07:00 interval", () => {
  assert.equal(getLogicalShiftDate(new Date("2026-11-02T05:59:00+07:00")), "2026-11-01");
  assert.equal(getLogicalShiftDate(new Date("2026-11-02T06:00:00+07:00")), "2026-11-02");
  assert.equal(getLogicalShiftDate(new Date("2026-11-02T06:59:00+07:00")), "2026-11-02");
});
test("legacy maintenance totals and archive selection preserved using in-memory records only", async () => {
  const rows = [
    { id: "s1", branchId: "a", createdAt: new Date("2026-01-01T08:00:00+07:00"), status: "success", total: 15000, totalProfit: 4000, totalCommission: 1000 },
    { id: "s2", branchId: "a", createdAt: new Date("2026-01-01T08:00:00+07:00"), status: "refunded", total: 8000, totalProfit: 2500, totalCommission: 500 },
  ];
  const writes: any[] = [];
  const tx: any = {
    dailyIncomeSummary: { upsert: async (x: any) => { writes.push(x); } },
    commission: { updateMany: async (x: any) => { assert.equal(x.data.saleId, null); } },
    saleItem: { deleteMany: async (x: any) => { assert.deepEqual(x.where.saleId.in, ["s1", "s2"]); } },
    voucherSN: { updateMany: async (x: any) => { assert.equal(x.data.saleId, null); } },
    sale: { deleteMany: async (x: any) => { assert.deepEqual(x.where.id.in, ["s1", "s2"]); } },
  };
  const fake: any = {
    sale: { findMany: async ({ where }: any) => {
      if (where.createdAt) {
        assert.ok(Math.abs(Date.now() - where.createdAt.lt.getTime() - 30 * 86400000) < 5000);
        return rows;
      }
      assert.equal(where.status, "success");
      return rows.filter(r => r.status === "success");
    } },
    dailyIncomeSummary: tx.dailyIncomeSummary,
    $transaction: async (run: any) => run(tx),
  };
  await autoArchiveOldSales(fake);
  assert.deepEqual(writes[0].update, {
    revenue: { increment: 15000 }, totalProfit: { increment: 4000 },
    totalCommission: { increment: 1000 }, salesCount: { increment: 1 },
  });
  await backfillDailySummaries(fake);
  assert.deepEqual(writes[1].update, { revenue: 15000, totalProfit: 4000, totalCommission: 1000, salesCount: 1 });
  tx.sale.findMany = fake.sale.findMany;
  await autoArchiveOldSales({
    sale: { findMany: async () => { throw Error("must use pinned transaction"); } },
    $transaction: async () => { throw Error("must not open another transaction"); },
  } as any, tx);
  assert.deepEqual(writes[2], writes[0]);
  let seeds = 0;
  const oldBootstrapEnv = {
    adminUsername: process.env.INITIAL_ADMIN_USERNAME,
    adminPassword: process.env.INITIAL_ADMIN_PASSWORD,
    cashierUsername: process.env.INITIAL_CASHIER_USERNAME,
    cashierPassword: process.env.INITIAL_CASHIER_PASSWORD,
  };
  process.env.INITIAL_ADMIN_USERNAME = "test-owner";
  process.env.INITIAL_ADMIN_PASSWORD = "test-owner-password";
  process.env.INITIAL_CASHIER_USERNAME = "test-branch";
  process.env.INITIAL_CASHIER_PASSWORD = "test-branch-password";
  try {
    await syncCredentials({
      branch: { upsert: async (x: any) => { assert.deepEqual(x.update, {}); seeds++; return { id: "default-branch-id" }; } },
      user: { upsert: async (x: any) => { assert.deepEqual(x.update, {}); seeds++; } },
      globalConfig: { upsert: async (x: any) => { assert.deepEqual(x.update, {}); seeds++; } },
    } as any);
  } finally {
    if (oldBootstrapEnv.adminUsername === undefined) delete process.env.INITIAL_ADMIN_USERNAME;
    else process.env.INITIAL_ADMIN_USERNAME = oldBootstrapEnv.adminUsername;
    if (oldBootstrapEnv.adminPassword === undefined) delete process.env.INITIAL_ADMIN_PASSWORD;
    else process.env.INITIAL_ADMIN_PASSWORD = oldBootstrapEnv.adminPassword;
    if (oldBootstrapEnv.cashierUsername === undefined) delete process.env.INITIAL_CASHIER_USERNAME;
    else process.env.INITIAL_CASHIER_USERNAME = oldBootstrapEnv.cashierUsername;
    if (oldBootstrapEnv.cashierPassword === undefined) delete process.env.INITIAL_CASHIER_PASSWORD;
    else process.env.INITIAL_CASHIER_PASSWORD = oldBootstrapEnv.cashierPassword;
  }
  assert.equal(seeds, 4);
});

test("credential seed refuses to write without explicit account credentials", async () => {
  const keys = [
    "INITIAL_ADMIN_USERNAME",
    "INITIAL_ADMIN_PASSWORD",
    "INITIAL_CASHIER_USERNAME",
    "INITIAL_CASHIER_PASSWORD",
  ] as const;
  const oldValues = keys.map(key => process.env[key]);
  for (const key of keys) delete process.env[key];
  let writes = 0;
  try {
    await assert.rejects(syncCredentials({
      branch: { upsert: async () => { writes++; } },
      user: { upsert: async () => { writes++; } },
      globalConfig: { upsert: async () => { writes++; } },
    } as any), /explicit INITIAL_ADMIN_\* and INITIAL_CASHIER_\* environment values/);
    assert.equal(writes, 0);
  } finally {
    keys.forEach((key, index) => {
      if (oldValues[index] === undefined) delete process.env[key];
      else process.env[key] = oldValues[index];
    });
  }
});
