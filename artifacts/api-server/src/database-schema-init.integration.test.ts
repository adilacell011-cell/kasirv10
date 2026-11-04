import assert from "node:assert/strict";
import test from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { Prisma, PrismaClient } from "@prisma/client";
import { initializeEmptyStagingSchema } from "./database-schema-init";
import { inspectDatabase } from "./database-readiness";
import { validateDatabaseTarget } from "./database-target";

const enabled = process.env.RUN_SCHEMA_INIT_INTEGRATION === "1";
const partialEnabled = process.env.RUN_SCHEMA_INIT_PARTIAL_INTEGRATION === "1";

test("fresh isolated PostgreSQL schema initializes once, compatible schema is skipped, and API restart stays read-only", {
  skip: !enabled,
  timeout: 180_000,
}, async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DB_RUNTIME_ENV: "test",
    SCHEMA_INIT_AUTO_TARGET:
      "test:127.0.0.1:5432/kasirv10_schema_init_qa/public",
  };
  const target = validateDatabaseTarget(env);
  assert.equal(target.environment, "test");
  assert.equal(target.host, "127.0.0.1");
  assert.equal(target.database, "kasirv10_schema_init_qa");
  assert.equal(target.schema, "public");
  assert.equal(
    env.STAGING_SCHEMA_INIT_TARGET,
    `test:127.0.0.1:${target.port}/kasirv10_schema_init_qa/public`,
  );

  const prisma = new PrismaClient();
  let api: ChildProcess | undefined;
  let apiOutput = "";
  try {
    await prisma.$connect();
    const emptyBefore = await prisma.$queryRaw<{ table_count: number }[]>`
      SELECT COUNT(*)::int AS table_count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    assert.equal(emptyBefore[0]?.table_count, 0, "integration DB must start without tables");

    await initializeEmptyStagingSchema(["--compose-auto-if-empty"], env);
    await inspectDatabase(prisma, target);
    const tableCounts = await prisma.$queryRaw<{ table_count: number }[]>`
      SELECT COUNT(*)::int AS table_count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    assert.equal(tableCounts[0]?.table_count, 15, "the current Prisma schema must provision 15 tables");
    const schemaFingerprint = await prisma.$queryRaw<{ digest: string | null }[]>`
      SELECT md5(string_agg(row_to_json(c)::text, '' ORDER BY table_name, ordinal_position)) AS digest
      FROM information_schema.columns c WHERE table_schema = 'public'`;
    assert.ok(schemaFingerprint[0]?.digest);

    const dataCounts = async () => {
      const counts: Record<string, number> = {};
      for (const model of Prisma.dmmf.datamodel.models) {
        const table = Prisma.raw(`"public"."${model.dbName || model.name}"`);
        const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM ${table}`;
        counts[model.name] = rows[0]?.count ?? -1;
      }
      return counts;
    };
    const emptyCounts = await dataCounts();
    assert.ok(Object.values(emptyCounts).every(count => count === 0), "schema provisioning must create no records");

    await initializeEmptyStagingSchema(["--compose-auto-if-empty"], env);
    await inspectDatabase(prisma, target);
    assert.deepEqual(
      await prisma.$queryRaw<{ digest: string | null }[]>`
        SELECT md5(string_agg(row_to_json(c)::text, '' ORDER BY table_name, ordinal_position)) AS digest
        FROM information_schema.columns c WHERE table_schema = 'public'`,
      schemaFingerprint,
      "a complete compatible schema must be skipped without DDL",
    );

    for (let restart = 0; restart < 2; restart++) {
      const reserved = createServer();
      reserved.listen(0, "127.0.0.1");
      await once(reserved, "listening");
      const port = (reserved.address() as { port: number }).port;
      await new Promise<void>((resolve, reject) =>
        reserved.close(error => error ? reject(error) : resolve()),
      );
      api = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
        cwd: process.cwd(),
        env: { ...env, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      api.stdout?.on("data", chunk => { apiOutput += chunk.toString(); });
      api.stderr?.on("data", chunk => { apiOutput += chunk.toString(); });
      const deadline = Date.now() + 20_000;
      let healthy = false;
      while (Date.now() < deadline && api.exitCode === null) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
          if (response.ok) { healthy = true; break; }
        } catch { /* wait for startup */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(healthy, true, `API startup ${restart + 1} must be healthy. Output: ${apiOutput}`);
      api.kill("SIGTERM");
      await once(api, "exit");
      api = undefined;

      const schemaAfterStartup = await prisma.$queryRaw<{ digest: string | null }[]>`
        SELECT md5(string_agg(row_to_json(c)::text, '' ORDER BY table_name, ordinal_position)) AS digest
        FROM information_schema.columns c WHERE table_schema = 'public'`;
      assert.deepEqual(schemaAfterStartup, schemaFingerprint, "normal API restart must not change schema");
      assert.deepEqual(await dataCounts(), emptyCounts, "normal API restart must not create or change records");
    }
  } finally {
    if (api && api.exitCode === null) {
      api.kill("SIGTERM");
      await once(api, "exit");
    }
    await prisma.$disconnect();
  }
});

test("partial isolated PostgreSQL schema is refused and left untouched", {
  skip: !partialEnabled,
  timeout: 30_000,
}, async () => {
  const databaseUrl = process.env.SCHEMA_INIT_PARTIAL_DATABASE_URL;
  assert.ok(databaseUrl, "provide a dedicated temporary QA database URL for the partial-schema case");
  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(database, /(?:^|[_-])(?:qa|test|staging)(?:[_-]|$)/i);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname));
  const targetEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DB_RUNTIME_ENV: "test",
    DATABASE_URL: databaseUrl,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: database,
    DB_EXPECTED_HOST: parsed.hostname,
    DB_EXPECTED_NAME: database,
    DB_EXPECTED_PORT: parsed.port || "5432",
    DB_EXPECTED_SCHEMA: "public",
    SCHEMA_INIT_AUTO_TARGET:
      `test:${parsed.hostname}:${parsed.port || "5432"}/${database}/public`,
  };
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$connect();
    const before = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'kasirv10_partial_sentinel'`;
    assert.equal(before.length, 1, "the isolated test database must contain its sentinel table");
    await assert.rejects(
      initializeEmptyStagingSchema(["--compose-auto-if-empty"], targetEnv, prisma),
      /non-empty but incomplete or incompatible; no schema changes were made/,
    );
    const after = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'kasirv10_partial_sentinel'`;
    assert.deepEqual(after, before, "refusal must preserve the existing partial schema");
  } finally {
    await prisma.$disconnect();
  }
});
