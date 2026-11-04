import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { Prisma, PrismaClient } from "@prisma/client";
import { runMaintenance } from "./maintenance-cli";
import { validateDatabaseTarget } from "./database-target";

const enabled = process.env.RUN_OWNER_BOOTSTRAP_INTEGRATION === "1";

test("manual Owner bootstrap supports an Owner without branch and startup is read-only", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const target = validateDatabaseTarget(process.env);
  assert.equal(target.environment, "test");
  assert.equal(target.host, "127.0.0.1");
  assert.equal(target.database, "kasirv10_owner_qa");
  assert.equal(target.schema, "public");

  const ownerUsername = process.env.STAGING_OWNER_USERNAME;
  const ownerPassword = process.env.STAGING_OWNER_PASSWORD;
  assert.ok(ownerUsername && ownerPassword, "the QA-only owner credentials must be supplied by the test shell");
  const jwtSecret = randomBytes(32).toString("hex");
  const cashierPassword = randomBytes(24).toString("base64url");
  const legacyAdminPassword = randomBytes(24).toString("base64url");
  const legacyCashierPassword = randomBytes(24).toString("base64url");

  const prisma = new PrismaClient();
  let apiProcess: ChildProcess | undefined;
  let apiOutput = "";
  await prisma.$connect();

  const approval = `--approve=bootstrap-owner:${target.environment}:${target.host}:${target.port}/${target.database}/${target.schema}`;
  const maintenanceArgs = [
    "bootstrap-owner",
    "--execute",
    "--acknowledge-legacy-risks",
    approval,
  ];

  const snapshot = async () => ({
    tables: await (async () => {
      const tables: Record<string, unknown> = {};
      for (const model of Prisma.dmmf.datamodel.models) {
        const table = Prisma.raw(`"public"."${model.dbName || model.name}"`);
        tables[model.name] = await prisma.$queryRaw`
          SELECT COUNT(*)::int AS count,
            md5(COALESCE(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) AS digest
          FROM ${table} r`;
      }
      return tables;
    })(),
    users: await prisma.user.findMany({
      select: { id: true, username: true, name: true, role: true, branchId: true, status: true, updatedAt: true },
      orderBy: { username: "asc" },
    }),
    branches: await prisma.branch.findMany({
      select: { id: true, name: true, address: true, phone: true },
      orderBy: { id: "asc" },
    }),
    globalConfig: await prisma.globalConfig.findMany({ orderBy: { id: "asc" } }),
  });

  const allocatePort = async () => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
    return port;
  };

  const startApi = (port: number) => {
    const childEnv = {
      ...process.env,
      NODE_ENV: "test",
      DB_RUNTIME_ENV: "test",
      PORT: String(port),
      JWT_SECRET: jwtSecret,
      // Prove these legacy seed values do not trigger account creation at startup.
      INITIAL_ADMIN_USERNAME: "unexpected-startup-admin",
      INITIAL_ADMIN_PASSWORD: legacyAdminPassword,
      INITIAL_CASHIER_USERNAME: "unexpected-startup-cashier",
      INITIAL_CASHIER_PASSWORD: legacyCashierPassword,
    };
    const child = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => { apiOutput += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { apiOutput += chunk.toString(); });
    return child;
  };

  const waitForApi = async (child: ChildProcess, port: number) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
        if (response.ok) return;
      } catch { /* wait for the listener */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(child.exitCode, null, "API process exited before becoming healthy");
    assert.fail("API did not become healthy within the test timeout");
  };

  const stopApi = async () => {
    if (!apiProcess || apiProcess.exitCode !== null) return;
    const child = apiProcess;
    child.kill("SIGTERM");
    await once(child, "exit");
    apiProcess = undefined;
  };

  try {
    assert.equal(await prisma.user.count(), 0, "integration database must start without users");
    assert.equal(await prisma.branch.count(), 0, "integration database must start without branches");
    assert.equal(await prisma.globalConfig.count(), 0, "integration database must start without global config");

    await runMaintenance(maintenanceArgs);
    const owner = await prisma.user.findUniqueOrThrow({ where: { username: ownerUsername } });
    assert.equal(owner.role, "ADMIN");
    assert.equal(owner.branchId, null);
    assert.equal(owner.status, "Active");
    assert.equal(await prisma.user.count(), 1, "bootstrap must create no cashier account");
    assert.equal(await prisma.branch.count(), 0, "bootstrap must create no example branch");
    assert.equal(await prisma.globalConfig.count(), 1);
    assert.equal((await prisma.globalConfig.findUniqueOrThrow({ where: { id: "default" } })).allowCashierStockInput, true);

    await assert.rejects(runMaintenance(maintenanceArgs), /an ADMIN account already exists/);
    assert.equal(await prisma.user.count({ where: { role: "ADMIN" } }), 1, "bootstrap must refuse a second Owner");

    const port = await allocatePort();
    const base = `http://127.0.0.1:${port}/api`;
    apiProcess = startApi(port);
    await waitForApi(apiProcess, port);

    const loginResponse = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ownerUsername, password: ownerPassword }),
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json() as { token: string; user: { role: string; branchId: string | null } };
    assert.equal(login.user.role, "ADMIN");
    assert.equal(login.user.branchId, null);
    const authHeaders = {
      Authorization: `Bearer ${login.token}`,
      "Content-Type": "application/json",
    };

    const dashboard = await fetch(`${base}/owner-dashboard`, { headers: authHeaders });
    assert.equal(dashboard.status, 200);

    const branchResponse = await fetch(`${base}/branches`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "QA Cabang", address: "QA", phone: "000", allowEmployeeInput: true }),
    });
    assert.equal(branchResponse.status, 200);
    const branch = await branchResponse.json() as { id: string };
    assert.ok(branch.id);

    const cashierResponse = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        username: "qa-cashier",
        password: cashierPassword,
        name: "Kasir QA",
        role: "CASHIER",
        branchId: branch.id,
      }),
    });
    assert.equal(cashierResponse.status, 200);
    assert.equal(await prisma.user.count(), 2);
    assert.equal(await prisma.branch.count(), 1);
    const beforeRestart = await snapshot();

    await stopApi();
    apiProcess = startApi(port);
    await waitForApi(apiProcess, port);
    const loginAfterRestart = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ownerUsername, password: ownerPassword }),
    });
    assert.equal(loginAfterRestart.status, 200);
    assert.deepEqual(await snapshot(), beforeRestart, "API restart must not create or alter accounts, branches or config");
  } finally {
    await stopApi();
    await prisma.$disconnect();
  }

  assert.ok(!apiOutput.includes(jwtSecret));
  assert.ok(!apiOutput.includes(ownerPassword));
  assert.ok(!apiOutput.includes(cashierPassword));
  assert.ok(!apiOutput.includes(legacyAdminPassword));
  assert.ok(!apiOutput.includes(legacyCashierPassword));
});
