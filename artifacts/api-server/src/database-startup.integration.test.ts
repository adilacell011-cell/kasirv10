import assert from "node:assert/strict";
import test from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { Prisma, PrismaClient } from "@prisma/client";
import { validateDatabaseTarget } from "./database-target";
import { inspectDatabase } from "./database-readiness";

// Explicit opt-in. All database operations in this file are SELECTs, including
// login/read-only API checks. No fixture creation, cleanup or migrations.
test("real isolated development startup is SELECT-only and preserves all tables", {
  skip: process.env.RUN_STARTUP_INTEGRATION !== "1", timeout: 60_000,
}, async () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", DB_RUNTIME_ENV: "development" };
  const target = validateDatabaseTarget(env); // refuses non-PG* target before any connection
  assert.equal(target.schema, "public");
  const prisma = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
  const queries: string[] = [];
  prisma.$on("query", e => { queries.push(e.query); });
  const snapshot = async () => {
    const tables: Record<string, unknown> = {};
    for (const model of Prisma.dmmf.datamodel.models) {
      // Identifiers come only from the installed Prisma datamodel, not requests.
      const table = Prisma.raw(`"public"."${model.dbName || model.name}"`);
      tables[model.name] = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count,
          md5(COALESCE(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) AS digest FROM ${table} r`;
    }
    const schema = await prisma.$queryRaw`
      SELECT md5(string_agg(row_to_json(c)::text, '' ORDER BY table_name, ordinal_position)) AS digest
      FROM information_schema.columns c WHERE table_schema = 'public'`;
    const constraints = await prisma.$queryRaw`
      SELECT md5(string_agg(pg_get_constraintdef(oid), '' ORDER BY conrelid, conname)) AS digest
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace`;
    const indexes = await prisma.$queryRaw`
      SELECT md5(string_agg(indexdef, '' ORDER BY tablename, indexname)) AS digest
      FROM pg_indexes WHERE schemaname = 'public'`;
    return { tables, schema, constraints, indexes };
  };
  const portServer = createServer();
  portServer.listen(0, "127.0.0.1");
  await once(portServer, "listening");
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  let child: ChildProcess | undefined;
  const launch = (patch: NodeJS.ProcessEnv) => {
    let output = "";
    const proc = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
      cwd: process.cwd(), env: { ...env, PORT: String(port), ...patch }, stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout!.on("data", chunk => { output += chunk.toString(); });
    proc.stderr!.on("data", chunk => { output += chunk.toString(); });
    return { proc, output: () => output };
  };
  const waitExit = async (proc: ChildProcess) => {
    if (proc.exitCode !== null) return proc.exitCode;
    const timer = setTimeout(() => proc.kill("SIGKILL"), 15_000);
    try { const [code] = await once(proc, "exit"); return code; }
    finally { clearTimeout(timer); }
  };
  try {
    await prisma.$connect();
    const before = await snapshot();
    await inspectDatabase(prisma, target);

    // Wrong remote URL must fail validation, not attempt a network connection.
    const wrong = launch({ DATABASE_URL: "postgresql://test:do-not-log@production.invalid/production" });
    child = wrong.proc;
    assert.equal(await waitExit(wrong.proc), 1);
    assert.match(wrong.output(), /invalid database target/);
    assert.doesNotMatch(wrong.output(), /do-not-log|production\.invalid|Server running/);

    // Deliberately closed loopback port; never contacts another database.
    const unavailable = launch({
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unavailable?connect_timeout=1",
      PGHOST: "127.0.0.1", PGPORT: "1", PGDATABASE: "unavailable",
      DB_EXPECTED_HOST: "127.0.0.1", DB_EXPECTED_PORT: "1", DB_EXPECTED_NAME: "unavailable",
    });
    child = unavailable.proc;
    assert.equal(await waitExit(unavailable.proc), 1);
    assert.match(unavailable.output(), /database unavailable or incompatible/);
    assert.doesNotMatch(unavailable.output(), /Server running/);

    // Missing schema is simulated by selecting a nonexistent namespace in the
    // SAME approved development database; no namespace is created or dropped.
    const absentUrl = new URL(env.DATABASE_URL!);
    absentUrl.searchParams.set("schema", "qa_startup_missing_schema");
    const incompatible = launch({
      DATABASE_URL: absentUrl.toString(), DB_EXPECTED_SCHEMA: "qa_startup_missing_schema",
    });
    child = incompatible.proc;
    assert.equal(await waitExit(incompatible.proc), 1);
    assert.match(incompatible.output(), /database unavailable or incompatible/);
    assert.doesNotMatch(incompatible.output(), /Server running/);

    const good = launch({});
    child = good.proc;
    const deadline = Date.now() + 15_000;
    while (!good.output().includes("database and schema ready") && Date.now() < deadline && good.proc.exitCode === null) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(good.output(), /database and schema ready/);
    assert.doesNotMatch(good.output(), /Verifying|ALTER TABLE|auto-archiving|synchronized/);
    const base = `http://127.0.0.1:${port}/api`;
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/health`)).status, 200);

    // Existing synthetic accounts only; login and GET do not write data.
    for (const [username, password, expectedBranches] of [
      ["admin", "admin123", 3],
      ["qa-multi-c9f8bd2-a", "Qa-Multi-c9f8bd2!Stage1", 1],
      ["qa-multi-c9f8bd2-b", "Qa-Multi-c9f8bd2!Stage1", 1],
    ] as const) {
      const response = await fetch(`${base}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      assert.equal(response.status, 200);
      const { token, user } = await response.json() as any;
      const headers = { Authorization: `Bearer ${token}` };
      const branches = await (await fetch(`${base}/branches`, { headers })).json() as any[];
      assert.equal(branches.length, expectedBranches);
      for (const path of ["/products", "/daily-summaries", "/shifts", "/transactions", "/incentives"]) {
        const result = await fetch(`${base}${path}`, { headers });
        assert.equal(result.status, 200);
        const rows = await result.json() as any[];
        if (user.role === "CASHIER") {
          for (const row of rows) {
            if (path === "/products") assert.ok(Object.keys(row.stocks).every(id => id === user.branchId));
            else assert.equal(row.branchId, user.branchId);
          }
        }
      }
    }
    good.proc.kill("SIGTERM");
    await waitExit(good.proc);
    child = undefined;
    assert.deepEqual(await snapshot(), before, "all data and schema fingerprints must remain unchanged");
    assert.ok(queries.length > 0);
    assert.ok(queries.every(sql => /^\s*SELECT\b/i.test(sql)), "probe/fingerprint queries are SELECT only");
    console.log(`Read-only proof: ${Object.keys(before.tables).length} table digests and schema/constraint/index digests unchanged.`);
  } finally {
    if (child && child.exitCode === null) { child.kill("SIGTERM"); await waitExit(child); }
    await prisma.$disconnect();
  }
});
