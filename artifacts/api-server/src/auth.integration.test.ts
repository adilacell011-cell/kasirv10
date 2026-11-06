import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { io, type Socket } from "socket.io-client";
import { autoArchiveOldSales } from "./maintenance-operations";
import { getLogicalShiftDate } from "./business-date";
import { hashIdempotencyScope } from "./idempotency";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("Set TEST_DATABASE_URL to a dedicated local PostgreSQL test database.");
}
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("Refusing to run auth integration tests against DATABASE_URL.");
}

const parsedDatabaseUrl = new URL(testDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedDatabaseUrl.hostname)) {
  throw new Error("TEST_DATABASE_URL must point to a local PostgreSQL test database.");
}
if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
  throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
}

// All Prisma operations in this test process are explicitly redirected to the
// isolated test database. The API child process receives the same override.
process.env.DATABASE_URL = testDatabaseUrl;
const prisma = new PrismaClient();
const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jwtSecret = "auth-integration-test-secret-only";
const connectedSockets = new Set<Socket>();

let apiProcess: ChildProcess | undefined;
let apiUrl = "";
let apiPort = 0;
type ApiMemorySample = {
  sampledAt: string;
  rssMiB: number;
  heapTotalMiB: number;
  heapUsedMiB: number;
  externalMiB: number;
  arrayBuffersMiB: number;
};
const apiMemorySamples: ApiMemorySample[] = [];
let branchAId = "";
let branchBId = "";
let cashierA: { id: string; username: string; password: string };
let cashierB: { id: string; username: string; password: string };
let inactiveCashier: { id: string; username: string; password: string };
let admin: { id: string; username: string; password: string };
let productId = "";
let otherBranchSaleId = "";

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (apiProcess?.exitCode !== null && apiProcess?.exitCode !== undefined) {
      throw new Error(`API test process exited before becoming ready (${apiProcess.exitCode}).`);
    }
    try {
      const response = await fetch(`${apiUrl}/api/healthz`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API test process did not become ready: ${String(lastError ?? "timeout")}`);
}

async function readApiRssKb(): Promise<number | null> {
  if (!apiProcess?.pid) return null;
  try {
    const status = await readFile(`/proc/${apiProcess.pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function startApi(): Promise<void> {
  apiProcess = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      DB_RUNTIME_ENV: "test",
      PGHOST: parsedDatabaseUrl.hostname,
      PGPORT: parsedDatabaseUrl.port || "5432",
      PGDATABASE: decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)),
      DB_EXPECTED_HOST: parsedDatabaseUrl.hostname,
      DB_EXPECTED_PORT: parsedDatabaseUrl.port || "5432",
      DB_EXPECTED_NAME: decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)),
      JWT_SECRET: jwtSecret,
      PORT: String(apiPort),
      NODE_ENV: "test",
      KASIRV10_MEMORY_DIAGNOSTICS: "true",
      KASIRV10_MEMORY_DIAGNOSTICS_INTERVAL_MS: "1000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdoutBuffer = "";
  apiProcess.stdout?.setEncoding("utf8");
  apiProcess.stdout?.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const marker = "KASIRV10_API_MEMORY_SAMPLE ";
      if (!line.startsWith(marker)) continue;
      try {
        apiMemorySamples.push(JSON.parse(line.slice(marker.length)) as ApiMemorySample);
      } catch {
        // Invalid diagnostic lines are ignored; API behavior is tested separately.
      }
    }
  });
  apiProcess.stderr?.on("data", () => {});
  await waitForApi();
}

async function stopApi(): Promise<void> {
  if (!apiProcess || apiProcess.exitCode !== null) return;
  apiProcess.kill("SIGTERM");
  await Promise.race([
    once(apiProcess, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (apiProcess.exitCode === null) apiProcess.kill("SIGKILL");
}

async function login(username: string, password: string) {
  return fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

async function connectSocket(auth: Record<string, string>): Promise<Socket> {
  const socket = io(apiUrl, {
    auth,
    reconnection: false,
    timeout: 2_000,
    transports: ["websocket"],
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out connecting to test Socket.IO server."));
    }, 4_000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      connectedSockets.add(socket);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });
  });
}

async function expectSocketRejected(auth: Record<string, string>, message: RegExp): Promise<void> {
  const socket = io(apiUrl, {
    auth,
    reconnection: false,
    timeout: 2_000,
    transports: ["websocket"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Expected Socket.IO handshake rejection.")), 4_000);
      socket.once("connect", () => {
        clearTimeout(timeout);
        reject(new Error("Socket.IO unexpectedly accepted an unauthenticated connection."));
      });
      socket.once("connect_error", (error) => {
        clearTimeout(timeout);
        assert.match(error.message, message);
        resolve();
      });
    });
  } finally {
    socket.close();
  }
}

async function waitForSocketDisconnect(socket: Socket): Promise<void> {
  if (!socket.connected) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("disconnect", onDisconnect);
      reject(new Error("Socket.IO session was not revoked after account access changed."));
    }, 4_000);
    const onDisconnect = () => {
      clearTimeout(timeout);
      resolve();
    };
    socket.once("disconnect", onDisconnect);
  });
}

function waitForEvent(socket: Socket, expectedBranchId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("stockUpdated", onStockUpdated);
      reject(new Error(`No stockUpdated event received for branch ${expectedBranchId}.`));
    }, 4_000);
    const onStockUpdated = (payload: { branchId?: string }) => {
      if (payload.branchId !== expectedBranchId) return;
      clearTimeout(timeout);
      socket.off("stockUpdated", onStockUpdated);
      resolve();
    };
    socket.on("stockUpdated", onStockUpdated);
  });
}

before(async () => {
  // The test command owns schema setup and never falls back to DATABASE_URL.
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], {
    cwd: apiDirectory,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "pipe",
  });

  const suffix = crypto.randomUUID();
  branchAId = `auth-test-a-${suffix}`;
  branchBId = `auth-test-b-${suffix}`;
  cashierA = { id: `auth-cashier-a-${suffix}`, username: `auth-cashier-a-${suffix}`, password: "cashier-a-test-password" };
  cashierB = { id: `auth-cashier-b-${suffix}`, username: `auth-cashier-b-${suffix}`, password: "cashier-b-test-password" };
  inactiveCashier = { id: `auth-cashier-inactive-${suffix}`, username: `auth-cashier-inactive-${suffix}`, password: "inactive-cashier-test-password" };
  admin = { id: `auth-admin-${suffix}`, username: `auth-admin-${suffix}`, password: "admin-test-password" };
  productId = `auth-product-${suffix}`;
  otherBranchSaleId = `auth-sale-${suffix}`;

  await prisma.branch.createMany({
    data: [
      { id: branchAId, name: "Auth Test Branch A" },
      { id: branchBId, name: "Auth Test Branch B" },
    ],
  });
  const passwordHash = async (password: string) => bcrypt.hash(password, 4);
  await prisma.user.createMany({
    data: [
      { id: cashierA.id, username: cashierA.username, password: await passwordHash(cashierA.password), name: "Test Cashier A", role: "CASHIER", branchId: branchAId, status: "Active" },
      { id: cashierB.id, username: cashierB.username, password: await passwordHash(cashierB.password), name: "Test Cashier B", role: "CASHIER", branchId: branchBId, status: "Active" },
      { id: inactiveCashier.id, username: inactiveCashier.username, password: await passwordHash(inactiveCashier.password), name: "Inactive Test Cashier", role: "CASHIER", branchId: branchAId, status: "Inactive" },
      { id: admin.id, username: admin.username, password: await passwordHash(admin.password), name: "Test Admin", role: "ADMIN", branchId: branchAId, status: "Active" },
    ],
  });
  await prisma.product.create({
    data: {
      id: productId,
      name: "Auth Integration Test Product",
      buyingPrice: 10000,
      sellingPrice: 15000,
      commissionAmount: 1000,
    },
  });
  await prisma.sale.create({
    data: {
      id: otherBranchSaleId,
      branchId: branchBId,
      cashierId: admin.id,
      total: 10,
      totalCommission: 0,
      totalProfit: 0,
      status: "success",
    },
  });

  apiPort = await getAvailablePort();
  apiUrl = `http://127.0.0.1:${apiPort}`;
  await startApi();
});

after(async () => {
  for (const socket of connectedSockets) socket.close();
  await stopApi();
  await prisma.$disconnect();
});

test("login, protected routes, branch isolation, and Socket.IO rooms stay secure", async () => {
  const cashierLogin = await login(cashierA.username, cashierA.password);
  assert.equal(cashierLogin.status, 200);
  const cashierPayload = await cashierLogin.json() as { token: string; user: Record<string, unknown> };
  assert.ok(cashierPayload.token);
  assert.equal(cashierPayload.user.role, "CASHIER");
  assert.equal(cashierPayload.user.branchId, branchAId);
  assert.equal("password" in cashierPayload.user, false);

  const invalidLogin = await login(cashierA.username, "incorrect-password");
  assert.equal(invalidLogin.status, 401);

  const unauthenticatedRequest = await fetch(`${apiUrl}/api/transactions`);
  assert.equal(unauthenticatedRequest.status, 401);

  const cashierTransactions = await fetch(`${apiUrl}/api/transactions?branchId=${encodeURIComponent(branchBId)}`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  assert.equal(cashierTransactions.status, 200);
  const cashierSalePage = await cashierTransactions.json() as {
    items: Array<{ id: string; branchId: string }>;
    nextCursor: string | null;
  };
  assert.ok(Array.isArray(cashierSalePage.items));
  assert.ok(cashierSalePage.nextCursor === null || typeof cashierSalePage.nextCursor === "string");
  const cashierSales = cashierSalePage.items;
  assert.equal(cashierSales.some((sale) => sale.id === otherBranchSaleId || sale.branchId === branchBId), false);

  const adminLogin = await login(admin.username, admin.password);
  assert.equal(adminLogin.status, 200);
  const adminPayload = await adminLogin.json() as { token: string };
  const adminTransactions = await fetch(`${apiUrl}/api/transactions?branchId=${encodeURIComponent(branchBId)}`, {
    headers: { authorization: `Bearer ${adminPayload.token}` },
  });
  assert.equal(adminTransactions.status, 200);
  const adminSales = (await adminTransactions.json() as {
    items: Array<{ id: string; branchId: string }>;
  }).items;
  assert.ok(adminSales.some((sale) => sale.id === otherBranchSaleId && sale.branchId === branchBId));

  await expectSocketRejected({ role: "ADMIN", branchId: branchBId }, /Unauthorized/);
  await expectSocketRejected({ token: "not-a-valid-jwt", role: "ADMIN", branchId: branchBId }, /Invalid or expired token/);

  const cashierASocket = await connectSocket({
    token: cashierPayload.token,
    role: "ADMIN",
    branchId: branchBId,
  });
  const cashierBLogin = await login(cashierB.username, cashierB.password);
  assert.equal(cashierBLogin.status, 200);
  const cashierBPayload = await cashierBLogin.json() as { token: string };
  const cashierBSocket = await connectSocket({ token: cashierBPayload.token });
  const adminSocket = await connectSocket({ token: adminPayload.token });

  const shiftOpenResponse = await fetch(`${apiUrl}/api/shifts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      initialCash: 0,
      shiftDate: new Date().toISOString().slice(0, 10),
      shiftType: "Pagi",
    }),
  });
  assert.equal(shiftOpenResponse.status, 200);
  const activeShift = await shiftOpenResponse.json() as { id: string; status: string; cashierId: string };
  assert.equal(activeShift.status, "open");
  assert.equal(activeShift.cashierId, cashierA.id);

  const assertRosterEditKeepsSession = async (body: Record<string, string>) => {
    const beforeEdit = await prisma.user.findUniqueOrThrow({
      where: { id: cashierA.id },
      select: { updatedAt: true },
    });
    const response = await fetch(`${apiUrl}/api/users/${cashierA.id}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminPayload.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    const updatedAccount = await response.json() as { id: string; name: string | null; alternativeNames: string | null };
    const afterEdit = await prisma.user.findUniqueOrThrow({
      where: { id: cashierA.id },
      select: { updatedAt: true },
    });
    assert.equal(afterEdit.updatedAt.getTime(), beforeEdit.updatedAt.getTime());

    const transactions = await fetch(`${apiUrl}/api/transactions`, {
      headers: { authorization: `Bearer ${cashierPayload.token}` },
    });
    assert.equal(transactions.status, 200);
    const users = await fetch(`${apiUrl}/api/users`, {
      headers: { authorization: `Bearer ${cashierPayload.token}` },
    });
    assert.equal(users.status, 200);
    const currentUsers = await users.json() as Array<{ id: string; name: string | null; alternativeNames: string | null }>;
    const visibleAccount = currentUsers.find((user) => user.id === cashierA.id);
    assert.ok(visibleAccount);
    assert.equal(visibleAccount.name, updatedAccount.name);
    assert.equal(visibleAccount.alternativeNames, updatedAccount.alternativeNames);
    const shifts = await fetch(`${apiUrl}/api/shifts?status=open`, {
      headers: { authorization: `Bearer ${cashierPayload.token}` },
    });
    assert.equal(shifts.status, 200);
    const currentShifts = await shifts.json() as Array<{ id: string; status: string; cashierId: string }>;
    assert.ok(currentShifts.some((shift) =>
      shift.id === activeShift.id && shift.status === "open" && shift.cashierId === cashierA.id
    ));
    assert.equal(cashierASocket.connected, true);
  };

  await assertRosterEditKeepsSession({ alternativeNames: "Penjaga Pagi, Penjaga Malam" });
  await assertRosterEditKeepsSession({ name: "Akun Cabang Test A" });
  await assertRosterEditKeepsSession({ alternativeNames: "Penjaga Malam, Penjaga Pagi" });
  await assertRosterEditKeepsSession({ alternativeNames: "Penjaga Malam" });

  const forbiddenStockChange = await fetch(`${apiUrl}/api/stocks/adjust`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productId, branchId: branchBId, qty: 1, type: "STOCK_IN" }),
  });
  assert.equal(forbiddenStockChange.status, 403);

  const cashierAEvents: Array<{ branchId?: string }> = [];
  const cashierBEvents: Array<{ branchId?: string }> = [];
  const adminEvents: Array<{ branchId?: string }> = [];
  cashierASocket.on("stockUpdated", (event) => cashierAEvents.push(event));
  cashierBSocket.on("stockUpdated", (event) => cashierBEvents.push(event));
  adminSocket.on("stockUpdated", (event) => adminEvents.push(event));

  const waitForA = waitForEvent(cashierASocket, branchAId);
  const waitForAdminA = waitForEvent(adminSocket, branchAId);
  const branchAUpdate = await fetch(`${apiUrl}/api/stocks/adjust`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productId, branchId: branchAId, qty: 2, type: "STOCK_IN" }),
  });
  assert.equal(branchAUpdate.status, 200);
  await Promise.all([waitForA, waitForAdminA]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(cashierBEvents.length, 0);

  const cashierProductsResponse = await fetch(`${apiUrl}/api/products`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  assert.equal(cashierProductsResponse.status, 200);
  const cashierProducts = await cashierProductsResponse.json() as Array<Record<string, unknown> & { id: string }>;
  const cashierProduct = cashierProducts.find((product) => product.id === productId);
  assert.ok(cashierProduct);
  assert.equal("buyingPrice" in cashierProduct, false);
  assert.equal("purchasePrice" in cashierProduct, false);

  const productUpdatePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("No productUpdated event received.")), 4_000);
    cashierASocket.once("productUpdated", (payload: Record<string, unknown>) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
  const productUpdateResponse = await fetch(`${apiUrl}/api/products`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: productId, name: "Auth Integration Test Product" }),
  });
  assert.equal(productUpdateResponse.status, 200);
  assert.deepEqual(await productUpdatePromise, { id: productId });

  const missingIdempotencyKeyResponse = await fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      items: [{ productId, qty: 1, price: 15000, subtotal: 15000, commission: 1000 }],
      total: 15000,
      totalCommission: 1000,
    }),
  });
  assert.equal(missingIdempotencyKeyResponse.status, 400);
  assert.equal(
    (await missingIdempotencyKeyResponse.json() as { code: string }).code,
    "IDEMPOTENCY_KEY_REQUIRED",
  );

  const maliciousSaleResponse = await fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
      "x-idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      items: [{ productId, qty: 1, price: 2, subtotal: 2, commission: 0 }],
      total: 2,
      totalCommission: 0,
    }),
  });
  assert.equal(maliciousSaleResponse.status, 409);
  assert.equal((await maliciousSaleResponse.json() as { code: string }).code, "SALE_AMOUNT_MISMATCH");

  const saleKey = crypto.randomUUID();
  const salePayload = {
    items: [{ productId, qty: 1, price: 15000, subtotal: 15000, commission: 1000 }],
    total: 15000,
    totalCommission: 1000,
  };
  const stockBeforeSale = await prisma.productStock.findFirst({ where: { productId, branchId: branchAId } });
  assert.ok(stockBeforeSale);
  const createSaleWithSameKey = () => fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
      "x-idempotency-key": saleKey,
    },
    body: JSON.stringify(salePayload),
  });
  const [saleResponseA, saleResponseB] = await Promise.all([
    createSaleWithSameKey(),
    createSaleWithSameKey(),
  ]);
  assert.equal(saleResponseA.status, 200);
  assert.equal(saleResponseB.status, 200);
  const createdSale = await saleResponseA.json() as {
    id: string;
    branchId: string;
    cashierId: string;
    total: number;
    totalCommission: number;
    totalProfit: number;
    items: Array<Record<string, unknown>>;
    idempotencyKeyHash?: string;
    idempotencyPayloadHash?: string;
  };
  const replayedSale = await saleResponseB.json() as { id: string };
  assert.equal(replayedSale.id, createdSale.id);
  assert.equal(createdSale.items[0].costPrice, undefined);
  assert.equal(createdSale.idempotencyKeyHash, undefined);
  assert.equal(createdSale.idempotencyPayloadHash, undefined);
  assert.equal(createdSale.total, 15000);
  assert.equal(createdSale.totalCommission, 1000);
  assert.equal(createdSale.totalProfit, 4000);
  const retainedSessionSale = createdSale;
  assert.equal(retainedSessionSale.branchId, branchAId);
  assert.equal(retainedSessionSale.cashierId, cashierA.id);
  const stockAfterSale = await prisma.productStock.findFirst({ where: { productId, branchId: branchAId } });
  assert.equal(stockAfterSale?.qty, stockBeforeSale.qty - 1);
  const commissionCountAfterSale = await prisma.commission.count({ where: { saleId: createdSale.id } });
  assert.equal(commissionCountAfterSale, 1);
  const commissionAfterSale = await prisma.commission.findFirst({ where: { saleId: createdSale.id } });
  assert.equal(commissionAfterSale?.amount, 1000);
  assert.equal(commissionAfterSale?.status, "earned");

  const reusedKeyWithDifferentPayload = await fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
      "x-idempotency-key": saleKey,
    },
    body: JSON.stringify({
      ...salePayload,
      items: [{ productId, qty: 2, price: 15000, subtotal: 30000, commission: 2000 }],
      total: 30000,
      totalCommission: 2000,
    }),
  });
  assert.equal(reusedKeyWithDifferentPayload.status, 409);
  assert.equal((await reusedKeyWithDifferentPayload.json() as { code: string }).code, "IDEMPOTENCY_KEY_REUSED");

  // A failure after the stock decrement must roll back Sale, stock, Commission
  // and the separate idempotency record as one database transaction.
  const rollbackKey = crypto.randomUUID();
  const stockBeforeRollback = await prisma.productStock.findFirst({
    where: { productId, branchId: branchAId },
  });
  assert.ok(stockBeforeRollback);
  const commissionsBeforeRollback = await prisma.commission.count({
    where: { productId, branchId: branchAId, cashierId: cashierA.id },
  });
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.kasir_test_fail_commission()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.sn = 'rollback-trigger' THEN RAISE EXCEPTION 'forced isolated QA failure'; END IF;
      RETURN NEW;
    END; $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER kasir_test_fail_commission
    BEFORE INSERT ON "Commission" FOR EACH ROW
    EXECUTE FUNCTION public.kasir_test_fail_commission()`);
  try {
    const failedAtomicSale = await fetch(`${apiUrl}/api/transactions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cashierPayload.token}`,
        "content-type": "application/json",
        "x-idempotency-key": rollbackKey,
      },
      body: JSON.stringify({
        ...salePayload,
        items: [{ ...salePayload.items[0], sn: "rollback-trigger" }],
      }),
    });
    assert.equal(failedAtomicSale.status, 500);
    assert.equal(await prisma.sale.count({
      where: { idempotencyKeyHash: hashIdempotencyScope({ accountId: cashierA.id, branchId: branchAId, key: rollbackKey }) },
    }), 0);
    assert.equal(await prisma.saleIdempotency.count({
      where: { scopeKeyHash: hashIdempotencyScope({ accountId: cashierA.id, branchId: branchAId, key: rollbackKey }) },
    }), 0);
    assert.equal((await prisma.productStock.findFirst({
      where: { productId, branchId: branchAId },
    }))?.qty, stockBeforeRollback.qty);
    assert.equal(await prisma.commission.count({
      where: { productId, branchId: branchAId, cashierId: cashierA.id },
    }), commissionsBeforeRollback);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS kasir_test_fail_commission ON "Commission"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.kasir_test_fail_commission()`);
  }

  const cashierSaleHistoryResponse = await fetch(`${apiUrl}/api/transactions?branchId=${branchAId}`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  assert.equal(cashierSaleHistoryResponse.status, 200);
  const cashierSaleHistory = (await cashierSaleHistoryResponse.json() as {
    items: Array<{
      id: string;
      items: Array<{ costPrice?: number; product?: { buyingPrice?: number; purchasePrice?: number } }>;
    }>;
  }).items;
  const cashierSale = cashierSaleHistory.find((sale) => sale.id === createdSale.id);
  assert.ok(cashierSale);
  assert.equal(cashierSale.items[0].costPrice, undefined);
  assert.equal(cashierSale.items[0].product?.buyingPrice, undefined);

  const productSalesResponse = await fetch(`${apiUrl}/api/products/sales-quantities?branchId=${branchBId}`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  assert.equal(productSalesResponse.status, 200);
  const productSales = await productSalesResponse.json() as Array<{ productId: string; qty: number }>;
  assert.deepEqual(productSales, [{ productId, qty: 1 }]);

  const firstTransactionPage = await fetch(`${apiUrl}/api/transactions?limit=1`, {
    headers: { authorization: `Bearer ${adminPayload.token}` },
  });
  assert.equal(firstTransactionPage.status, 200);
  const firstPage = await firstTransactionPage.json() as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  assert.equal(firstPage.items.length, 1);
  assert.ok(firstPage.nextCursor);
  const secondTransactionPage = await fetch(
    `${apiUrl}/api/transactions?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    { headers: { authorization: `Bearer ${adminPayload.token}` } },
  );
  assert.equal(secondTransactionPage.status, 200);
  const secondPage = await secondTransactionPage.json() as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(secondPage.items[0].id, firstPage.items[0].id);
  assert.equal(secondPage.nextCursor, null);

  const cashierCommissionResponse = await fetch(`${apiUrl}/api/incentives?branchId=${branchAId}`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  assert.equal(cashierCommissionResponse.status, 200);
  const cashierCommissions = await cashierCommissionResponse.json() as Array<{
    saleId: string;
    branchId: string;
    product?: { buyingPrice?: number; purchasePrice?: number };
    sale?: { idempotencyKeyHash?: string; idempotencyPayloadHash?: string };
  }>;
  assert.ok(cashierCommissions.length <= 50);
  assert.ok(cashierCommissions.every((commission) => commission.branchId === branchAId));
  const cashierCommission = cashierCommissions.find((commission) => commission.saleId === createdSale.id);
  assert.ok(cashierCommission);
  assert.equal(cashierCommission.product?.buyingPrice, undefined);
  assert.equal(cashierCommission.product?.purchasePrice, undefined);
  assert.equal(cashierCommission.sale, undefined);

  const commissionSummaryResponse = await fetch(`${apiUrl}/api/incentives/summary?branchId=${branchAId}`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  assert.equal(commissionSummaryResponse.status, 200);
  const commissionSummary = await commissionSummaryResponse.json() as {
    total: number;
    byBranch: Record<string, number>;
    byBranchStatus: Record<string, { earned: number; withdrawn: number; refunded: number }>;
  };
  const branchCommissionLedger = await prisma.commission.findMany({
    where: { branchId: branchAId },
    select: { amount: true, status: true },
  });
  const expectedBranchStatuses = { earned: 0, withdrawn: 0, refunded: 0 };
  for (const row of branchCommissionLedger) {
    if (row.status === "earned" || row.status === "withdrawn" || row.status === "refunded") {
      expectedBranchStatuses[row.status] += Number(row.amount);
    }
  }
  assert.equal(commissionSummary.byBranchStatus[branchAId].earned, expectedBranchStatuses.earned);
  assert.equal(commissionSummary.byBranchStatus[branchAId].withdrawn, expectedBranchStatuses.withdrawn);
  assert.equal(commissionSummary.byBranchStatus[branchAId].refunded, expectedBranchStatuses.refunded);
  assert.equal(commissionSummary.byBranch[branchAId], expectedBranchStatuses.earned);
  assert.equal(commissionSummary.total, expectedBranchStatuses.earned);

  const ownerSaleHistoryResponse = await fetch(`${apiUrl}/api/transactions?branchId=${branchAId}`, {
    headers: { authorization: `Bearer ${adminPayload.token}` },
  });
  const ownerSaleHistory = (await ownerSaleHistoryResponse.json() as {
    items: Array<{
      id: string;
      items: Array<{ costPrice?: number; product?: { buyingPrice?: number } }>;
    }>;
  }).items;
  const ownerSale = ownerSaleHistory.find((sale) => sale.id === createdSale.id);
  assert.equal(ownerSale?.items[0].costPrice, 10000);
  assert.equal(ownerSale?.items[0].product?.buyingPrice, 10000);

  const closeAfterRosterEdits = await fetch(`${apiUrl}/api/shifts/${activeShift.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "closed", reportedIncome: 2 }),
  });
  assert.equal(closeAfterRosterEdits.status, 200);
  const closedShift = await closeAfterRosterEdits.json() as { id: string; status: string };
  assert.equal(closedShift.id, activeShift.id);
  assert.equal(closedShift.status, "closed");

  const waitForB = waitForEvent(cashierBSocket, branchBId);
  const waitForAdminB = waitForEvent(adminSocket, branchBId);
  const branchBUpdate = await fetch(`${apiUrl}/api/stocks/adjust`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productId, branchId: branchBId, qty: 3, type: "STOCK_IN" }),
  });
  assert.equal(branchBUpdate.status, 200);
  await Promise.all([waitForB, waitForAdminB]);
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.deepEqual(cashierAEvents.map((event) => event.branchId), [branchAId]);
  assert.deepEqual(cashierBEvents.map((event) => event.branchId), [branchBId]);
  assert.deepEqual(adminEvents.map((event) => event.branchId), [branchAId, branchBId]);

  const inactiveWrongPassword = await login(inactiveCashier.username, "incorrect-inactive-password");
  assert.equal(inactiveWrongPassword.status, 401);
  const inactiveLogin = await login(inactiveCashier.username, inactiveCashier.password);
  assert.equal(inactiveLogin.status, 403);

  const statusDisconnect = waitForSocketDisconnect(cashierBSocket);
  const disableCashier = await fetch(`${apiUrl}/api/users/${cashierB.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "Inactive" }),
  });
  assert.equal(disableCashier.status, 200);
  await statusDisconnect;
  const disabledTokenRequest = await fetch(`${apiUrl}/api/transactions`, {
    headers: { authorization: `Bearer ${cashierBPayload.token}` },
  });
  assert.equal(disabledTokenRequest.status, 401);
  await expectSocketRejected({ token: cashierBPayload.token }, /Invalid or expired token/);

  const reactivateCashier = await fetch(`${apiUrl}/api/users/${cashierB.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "Active" }),
  });
  assert.equal(reactivateCashier.status, 200);
  const reactivatedOldToken = await fetch(`${apiUrl}/api/transactions`, {
    headers: { authorization: `Bearer ${cashierBPayload.token}` },
  });
  assert.equal(reactivatedOldToken.status, 401);

  const branchLogin = await login(cashierB.username, cashierB.password);
  assert.equal(branchLogin.status, 200);
  const branchPayload = await branchLogin.json() as { token: string; user: Record<string, unknown> };
  const branchSocket = await connectSocket({ token: branchPayload.token });
  const branchDisconnect = waitForSocketDisconnect(branchSocket);
  const moveCashier = await fetch(`${apiUrl}/api/users/${cashierB.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ branchId: branchAId }),
  });
  assert.equal(moveCashier.status, 200);
  await branchDisconnect;
  const staleBranchToken = await fetch(`${apiUrl}/api/transactions`, {
    headers: { authorization: `Bearer ${branchPayload.token}` },
  });
  assert.equal(staleBranchToken.status, 401);

  const roleLogin = await login(cashierB.username, cashierB.password);
  assert.equal(roleLogin.status, 200);
  const rolePayload = await roleLogin.json() as { token: string; user: Record<string, unknown> };
  const roleSocket = await connectSocket({ token: rolePayload.token });
  const roleDisconnect = waitForSocketDisconnect(roleSocket);
  const changeRole = await fetch(`${apiUrl}/api/users/${cashierB.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ role: "AUDIT" }),
  });
  assert.equal(changeRole.status, 200);
  await roleDisconnect;
  const staleRoleToken = await fetch(`${apiUrl}/api/transactions`, {
    headers: { authorization: `Bearer ${rolePayload.token}` },
  });
  assert.equal(staleRoleToken.status, 401);
  const currentRoleLogin = await login(cashierB.username, cashierB.password);
  assert.equal(currentRoleLogin.status, 200);
  const currentRolePayload = await currentRoleLogin.json() as { user: Record<string, unknown> };
  assert.equal(currentRolePayload.user.role, "AUDIT");
  assert.equal(currentRolePayload.user.branchId, branchAId);

  const passwordLogin = await login(cashierB.username, cashierB.password);
  assert.equal(passwordLogin.status, 200);
  const passwordPayload = await passwordLogin.json() as { token: string };
  const passwordSocket = await connectSocket({ token: passwordPayload.token });
  const passwordDisconnect = waitForSocketDisconnect(passwordSocket);
  cashierB.password = "cashier-b-updated-test-password";
  const changePassword = await fetch(`${apiUrl}/api/users/${cashierB.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ password: cashierB.password }),
  });
  assert.equal(changePassword.status, 200);
  await passwordDisconnect;
  const stalePasswordToken = await fetch(`${apiUrl}/api/transactions`, {
    headers: { authorization: `Bearer ${passwordPayload.token}` },
  });
  assert.equal(stalePasswordToken.status, 401);
  assert.equal((await login(cashierB.username, "cashier-b-test-password")).status, 401);
  assert.equal((await login(cashierB.username, cashierB.password)).status, 200);

  const deleteLogin = await login(cashierB.username, cashierB.password);
  assert.equal(deleteLogin.status, 200);
  const deletePayload = await deleteLogin.json() as { token: string };
  const deleteSocket = await connectSocket({ token: deletePayload.token });
  const deleteDisconnect = waitForSocketDisconnect(deleteSocket);
  const deleteAccount = await fetch(`${apiUrl}/api/users/${cashierB.id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${adminPayload.token}` },
  });
  assert.equal(deleteAccount.status, 200);
  await deleteDisconnect;
  const deletedAccountToken = await fetch(`${apiUrl}/api/transactions`, {
    headers: { authorization: `Bearer ${deletePayload.token}` },
  });
  assert.equal(deletedAccountToken.status, 401);

  const restartLogin = await login(cashierA.username, cashierA.password);
  assert.equal(restartLogin.status, 200);
  const restartPayload = await restartLogin.json() as { token: string };
  const legacyToken = jwt.sign({
    userId: cashierA.id,
    username: cashierA.username,
    role: "CASHIER",
    branchId: branchAId,
  }, jwtSecret, { expiresIn: "7d" });
  await stopApi();
  await startApi();
  for (const token of [restartPayload.token, legacyToken]) {
    const afterRestart = await fetch(`${apiUrl}/api/transactions`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(afterRestart.status, 200);
  }
  const replayAfterRestart = await fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${restartPayload.token}`,
      "content-type": "application/json",
      "x-idempotency-key": saleKey,
    },
    body: JSON.stringify(salePayload),
  });
  assert.equal(replayAfterRestart.status, 200);
  assert.equal((await replayAfterRestart.json() as { id: string }).id, createdSale.id);
  const stockAfterRestartReplay = await prisma.productStock.findFirst({
    where: { productId, branchId: branchAId },
  });
  assert.equal(stockAfterRestartReplay?.qty, stockAfterSale?.qty);
  assert.equal(
    await prisma.commission.count({ where: { saleId: createdSale.id } }),
    commissionCountAfterSale,
  );
  const reconnectedSocket = await connectSocket({ token: restartPayload.token });
  reconnectedSocket.close();

  // Archive more than one batch, then ensure the ledger retains the exact
  // server-calculated summary and repeated archive/retry does not write twice.
  const archivedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const originalSaleTimestamp = await prisma.sale.findUnique({
    where: { id: createdSale.id },
    select: { createdAt: true },
  });
  assert.ok(originalSaleTimestamp);
  await prisma.sale.update({
    where: { id: createdSale.id },
    data: { createdAt: archivedAt },
  });
  const originalSaleHashes = await prisma.sale.findUnique({
    where: { id: createdSale.id },
    select: { idempotencyPayloadHash: true },
  });
  assert.ok(originalSaleHashes?.idempotencyPayloadHash);
  const legacyKey = crypto.randomUUID();
  const legacySaleId = `legacy-archive-${crypto.randomUUID()}`;
  await prisma.sale.create({
    data: {
      id: legacySaleId,
      branchId: branchAId,
      cashierId: cashierA.id,
      total: createdSale.total,
      totalCommission: createdSale.totalCommission,
      totalProfit: createdSale.totalProfit,
      status: "refunded",
      createdAt: archivedAt,
      idempotencyKeyHash: hashIdempotencyScope({ accountId: cashierA.id, branchId: branchAId, key: legacyKey }),
      idempotencyPayloadHash: originalSaleHashes.idempotencyPayloadHash,
    },
  });
  await prisma.sale.createMany({
    data: Array.from({ length: 500 }, (_, index) => ({
      id: `archive-batch-${index}-${crypto.randomUUID()}`,
      branchId: branchAId,
      cashierId: cashierA.id,
      total: 1,
      totalCommission: 0,
      totalProfit: 0,
      status: "success",
      createdAt: archivedAt,
    })),
  });

  // Read the 500-row QA batch in small cursor pages repeatedly. Compare the
  // returned rows/totals with the same unpaged QA query, and sample API RSS.
  const expectedReadRows = await prisma.sale.findMany({
    where: { branchId: branchAId },
    select: { id: true, status: true, total: true, totalCommission: true },
  });
  const expectedReadTotals = expectedReadRows
    .filter((sale) => sale.status !== "refunded")
    .reduce((totals, sale) => ({
      revenue: totals.revenue + sale.total,
      commission: totals.commission + sale.totalCommission,
    }), { revenue: 0, commission: 0 });
  const rssBaseline = await readApiRssKb();
  const passRss: number[] = [];
  let requestsPerPass = 0;
  for (let pass = 0; pass < 3; pass++) {
    const received: Array<{ id: string; status: string; total: number; totalCommission: number }> = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const params = new URLSearchParams({
        branchId: branchAId,
        limit: "100",
      });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`${apiUrl}/api/transactions?${params}`, {
        headers: { authorization: `Bearer ${adminPayload.token}` },
      });
      assert.equal(response.status, 200);
      const page = await response.json() as {
        items: Array<{ id: string; status: string; total: number; totalCommission: number }>;
        nextCursor: string | null;
      };
      assert.ok(page.items.length <= 100);
      received.push(...page.items);
      pages++;
      cursor = page.nextCursor;
      const rss = await readApiRssKb();
      if (rss !== null) passRss.push(rss);
    } while (cursor);
    requestsPerPass = pages;
    assert.equal(received.length, expectedReadRows.length);
    assert.deepEqual(
      received.map((sale) => sale.id).sort(),
      expectedReadRows.map((sale) => sale.id).sort(),
    );
    const actualReadTotals = received
      .filter((sale) => sale.status !== "refunded")
      .reduce((totals, sale) => ({
        revenue: totals.revenue + sale.total,
        commission: totals.commission + sale.totalCommission,
      }), { revenue: 0, commission: 0 });
    assert.deepEqual(actualReadTotals, expectedReadTotals);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const rssFinal = await readApiRssKb();
  const rssPeak = passRss.length ? Math.max(...passRss) : null;
  console.log(
    `API_SALES_READ_RSS_KB baseline=${rssBaseline ?? "unavailable"} peak=${rssPeak ?? "unavailable"} final=${rssFinal ?? "unavailable"} pages_per_pass=${requestsPerPass} passes=3`,
  );
  if (rssBaseline !== null && rssFinal !== null) {
    assert.ok(rssFinal - rssBaseline < 96 * 1024, "API RSS grew by more than 96 MiB during repeated paged reads.");
  }

  const summaryDate = getLogicalShiftDate(archivedAt);
  const commissionsBeforeArchive = await prisma.commission.count({
    where: { productId, branchId: branchAId, cashierId: cashierA.id },
  });
  const commissionRowsBeforeArchive = await prisma.commission.findMany({
    where: { productId, branchId: branchAId, cashierId: cashierA.id },
    select: { amount: true, status: true },
  });
  const stockBeforeArchive = await prisma.productStock.findFirst({
    where: { productId, branchId: branchAId },
  });
  assert.ok(stockBeforeArchive);
  const saleLedgerBeforeArchive = await prisma.saleIdempotency.findUnique({
    where: { scopeKeyHash: hashIdempotencyScope({ accountId: cashierA.id, branchId: branchAId, key: saleKey }) },
  });
  assert.ok(saleLedgerBeforeArchive);
  await autoArchiveOldSales(prisma);
  assert.equal(await prisma.sale.count({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } }), 0);
  assert.equal(await prisma.saleItem.count({ where: { saleId: createdSale.id } }), 0);
  const archivedLedger = await prisma.saleIdempotency.findUnique({
    where: { scopeKeyHash: hashIdempotencyScope({ accountId: cashierA.id, branchId: branchAId, key: saleKey }) },
  });
  assert.ok(archivedLedger);
  assert.equal(archivedLedger.state, "ARCHIVED");
  assert.equal(archivedLedger.saleId, null);
  assert.equal(archivedLedger.originalSaleId, createdSale.id);
  assert.deepEqual(archivedLedger.resultSnapshot, {
    id: createdSale.id,
    branchId: branchAId,
    cashierId: cashierA.id,
    total: createdSale.total,
    totalCommission: createdSale.totalCommission,
    totalProfit: createdSale.totalProfit,
    status: "success",
    createdAt: archivedAt.toISOString(),
  });
  const legacyArchivedLedger = await prisma.saleIdempotency.findUnique({
    where: { scopeKeyHash: hashIdempotencyScope({ accountId: cashierA.id, branchId: branchAId, key: legacyKey }) },
  });
  assert.ok(legacyArchivedLedger);
  assert.equal(legacyArchivedLedger.state, "ARCHIVED");
  assert.equal(legacyArchivedLedger.originalSaleId, legacySaleId);
  assert.deepEqual(legacyArchivedLedger.resultSnapshot, {
    id: legacySaleId,
    branchId: branchAId,
    cashierId: cashierA.id,
    total: createdSale.total,
    totalCommission: createdSale.totalCommission,
    totalProfit: createdSale.totalProfit,
    status: "refunded",
    createdAt: archivedAt.toISOString(),
  });
  const archivedSummary = await prisma.dailyIncomeSummary.findUnique({
    where: { branchId_date: { branchId: branchAId, date: summaryDate } },
  });
  assert.equal(archivedSummary?.revenue, createdSale.total + 500);
  assert.equal(archivedSummary?.totalProfit, createdSale.totalProfit);
  assert.equal(archivedSummary?.totalCommission, createdSale.totalCommission);
  assert.equal(archivedSummary?.salesCount, 501);
  assert.equal(await prisma.commission.count({
    where: { productId, branchId: branchAId, cashierId: cashierA.id },
  }), commissionsBeforeArchive);
  const commissionRowsAfterArchive = await prisma.commission.findMany({
    where: { productId, branchId: branchAId, cashierId: cashierA.id },
    select: { amount: true, status: true, saleId: true },
  });
  assert.deepEqual(
    commissionRowsAfterArchive.map(({ amount, status }) => ({ amount, status })),
    commissionRowsBeforeArchive,
  );
  assert.ok(commissionRowsAfterArchive.every((commission) => commission.saleId === null));
  assert.equal((await prisma.productStock.findFirst({
    where: { productId, branchId: branchAId },
  }))?.qty, stockBeforeArchive.qty);

  await autoArchiveOldSales(prisma);
  const archivedSummaryAfterRepeat = await prisma.dailyIncomeSummary.findUnique({
    where: { branchId_date: { branchId: branchAId, date: summaryDate } },
  });
  assert.deepEqual(archivedSummaryAfterRepeat, archivedSummary);

  await stopApi();
  await startApi();
  const archivedReplay = await fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${restartPayload.token}`,
      "content-type": "application/json",
      "x-idempotency-key": saleKey,
    },
    body: JSON.stringify(salePayload),
  });
  assert.equal(archivedReplay.status, 200);
  const archivedReplayResult = await archivedReplay.json() as {
    id: string; total: number; totalCommission: number; totalProfit: number; createdAt: string; archived?: boolean; replay?: boolean;
  };
  assert.equal(archivedReplayResult.id, createdSale.id);
  assert.equal(archivedReplayResult.total, createdSale.total);
  assert.equal(archivedReplayResult.totalCommission, createdSale.totalCommission);
  assert.equal(archivedReplayResult.totalProfit, createdSale.totalProfit);
  assert.equal(archivedReplayResult.createdAt, archivedAt.toISOString());
  assert.equal(archivedReplayResult.archived, true);
  assert.equal(archivedReplayResult.replay, true);
  const legacyArchivedReplay = await fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${restartPayload.token}`,
      "content-type": "application/json",
      "x-idempotency-key": legacyKey,
    },
    body: JSON.stringify(salePayload),
  });
  assert.equal(legacyArchivedReplay.status, 200);
  const legacyReplayResult = await legacyArchivedReplay.json() as {
    id: string; status: string; archived?: boolean; replay?: boolean;
  };
  assert.equal(legacyReplayResult.id, legacySaleId);
  assert.equal(legacyReplayResult.status, "refunded");
  assert.equal(legacyReplayResult.archived, true);
  assert.equal(legacyReplayResult.replay, true);
  const archivedPayloadMismatch = await fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${restartPayload.token}`,
      "content-type": "application/json",
      "x-idempotency-key": saleKey,
    },
    body: JSON.stringify({ ...salePayload, total: 16000 }),
  });
  assert.equal(archivedPayloadMismatch.status, 409);
  assert.equal((await archivedPayloadMismatch.json() as { code: string }).code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(await prisma.sale.count({ where: { id: createdSale.id } }), 0);
  assert.equal(await prisma.saleIdempotency.count({
    where: { scopeKeyHash: hashIdempotencyScope({ accountId: cashierA.id, branchId: branchAId, key: saleKey }) },
  }), 1);
  assert.deepEqual(
    await prisma.dailyIncomeSummary.findUnique({ where: { branchId_date: { branchId: branchAId, date: summaryDate } } }),
    archivedSummary,
  );
  assert.equal((await prisma.productStock.findFirst({
    where: { productId, branchId: branchAId },
  }))?.qty, stockBeforeArchive.qty);

  await prisma.commission.createMany({
    data: Array.from({ length: 55 }, (_, index) => ({
      productId,
      cashierId: cashierA.id,
      branchId: branchAId,
      qty: 1,
      amount: index + 1,
      status: index % 3 === 0 ? "withdrawn" : index % 3 === 1 ? "refunded" : "earned",
      createdAt: new Date(Date.now() + index * 1_000),
    })),
  });
  const latestCommissionResponse = await fetch(`${apiUrl}/api/incentives?branchId=${branchAId}`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  assert.equal(latestCommissionResponse.status, 200);
  const latestCommissionRows = await latestCommissionResponse.json() as Array<Record<string, any>>;
  assert.equal(latestCommissionRows.length, 50);
  assert.ok(latestCommissionRows.every((row) => row.sale === undefined));
  assert.ok(latestCommissionRows.every((row) => row.product?.buyingPrice === undefined));

  const completeCommissionLedger = await prisma.commission.findMany({
    where: { branchId: branchAId },
    select: { amount: true, status: true },
  });
  const completeTotals = { earned: 0, withdrawn: 0, refunded: 0 };
  for (const row of completeCommissionLedger) {
    if (row.status === "earned" || row.status === "withdrawn" || row.status === "refunded") {
      completeTotals[row.status] += Number(row.amount);
    }
  }
  const completeSummaryResponse = await fetch(`${apiUrl}/api/incentives/summary?branchId=${branchAId}`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  const completeSummary = await completeSummaryResponse.json() as {
    total: number;
    byBranch: Record<string, number>;
    byBranchStatus: Record<string, { earned: number; withdrawn: number; refunded: number }>;
  };
  assert.equal(completeSummaryResponse.status, 200);
  assert.equal(completeSummary.total, completeTotals.earned);
  assert.equal(completeSummary.byBranch[branchAId], completeTotals.earned);
  assert.deepEqual(completeSummary.byBranchStatus[branchAId], completeTotals);

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  assert.ok(apiMemorySamples.length >= 2, "API emitted memory samples across startup/restart.");
  for (const sample of apiMemorySamples) {
    for (const value of [
      sample.rssMiB,
      sample.heapTotalMiB,
      sample.heapUsedMiB,
      sample.externalMiB,
      sample.arrayBuffersMiB,
    ]) {
      assert.ok(Number.isFinite(value) && value >= 0, "memory sample contains valid non-negative metrics");
    }
  }
  console.info("API_MEMORY_DIAGNOSTICS_TEST", JSON.stringify({
    samples: apiMemorySamples.length,
    first: apiMemorySamples[0],
    last: apiMemorySamples.at(-1),
  }));
});

test("live branch audit remains correct across successful sales before, during, and at finalization", async () => {
  const adminLogin = await login(admin.username, admin.password);
  assert.equal(adminLogin.status, 200);
  const adminPayload = await adminLogin.json() as { token: string };
  const headers = {
    authorization: `Bearer ${adminPayload.token}`,
    "content-type": "application/json",
  };
  const suffix = crypto.randomUUID();
  const barcode = `audit-${suffix}`;
  const auditBranch = await prisma.branch.create({ data: { name: `QA Audit Sale Branch ${suffix}` } });
  const auditProduct = await prisma.product.create({
    data: {
      name: `QA Audit Sale Product ${suffix}`,
      barcode,
      buyingPrice: 10_000,
      sellingPrice: 15_000,
      commissionAmount: 1_000,
      visibleBranchIds: auditBranch.id,
    },
  });
  await prisma.productStock.create({
    data: { productId: auditProduct.id, branchId: auditBranch.id, qty: 10 },
  });

  const auditResponse = await fetch(`${apiUrl}/api/stock-audits`, {
    method: "POST",
    headers,
    body: JSON.stringify({ branchId: auditBranch.id }),
  });
  assert.equal(auditResponse.status, 201);
  const audit = await auditResponse.json() as { id: string };
  const auditItemsUrl = (search = "") =>
    `${apiUrl}/api/stock-audits/items?auditId=${encodeURIComponent(audit.id)}&page=1&pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const initialItemsResponse = await fetch(auditItemsUrl(), { headers });
  const initialItems = await initialItemsResponse.json() as {
    items: Array<{ id: string; productId: string; expectedQty: number; systemQty: number }>;
  };
  assert.equal(initialItemsResponse.status, 200);
  const auditItem = initialItems.items.find((item) => item.productId === auditProduct.id);
  assert.ok(auditItem);
  assert.equal(auditItem.expectedQty, 10);
  assert.equal(auditItem.systemQty, 10);
  for (const otherItem of initialItems.items.filter((item) => item.productId !== auditProduct.id)) {
    const otherBeginResponse = await fetch(`${apiUrl}/api/stock-audits/begin-count`, {
      method: "POST",
      headers,
      body: JSON.stringify({ auditId: audit.id, itemId: otherItem.id }),
    });
    assert.equal(otherBeginResponse.status, 200);
    const otherBegin = await otherBeginResponse.json() as { baselineQty: number; countToken: string };
    const otherSaveResponse = await fetch(`${apiUrl}/api/stock-audits/count`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        auditId: audit.id,
        itemId: otherItem.id,
        countedQty: otherBegin.baselineQty,
        finding: "NORMAL",
        countToken: otherBegin.countToken,
      }),
    });
    assert.equal(otherSaveResponse.status, 200, "Unrelated zero-stock catalog items still need a recorded physical count before finalization.");
  }

  const makeSale = async (qty: number, key: string) => fetch(`${apiUrl}/api/transactions`, {
    method: "POST",
    headers: { ...headers, "x-idempotency-key": key },
    body: JSON.stringify({
      branchId: auditBranch.id,
      cashierId: admin.id,
      customerName: "QA stock-audit concurrency",
      items: [{
        productId: auditProduct.id,
        qty,
        price: 15_000,
        subtotal: qty * 15_000,
        commission: qty * 1_000,
      }],
      total: qty * 15_000,
      totalCommission: qty * 1_000,
    }),
  });

  const saleBeforeCount = await makeSale(2, `audit-before-${suffix}`);
  assert.equal(saleBeforeCount.status, 200, "A successful sale before physical count must be accepted");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: auditProduct.id, branchId: auditBranch.id } },
  })).qty, 8);
  const scannedItemsResponse = await fetch(auditItemsUrl(barcode), { headers });
  const scannedItems = await scannedItemsResponse.json() as {
    items: Array<{ id: string; barcode: string | null; expectedQty: number; systemQty: number }>;
  };
  assert.equal(scannedItemsResponse.status, 200);
  assert.equal(scannedItems.items[0]?.barcode, barcode);
  assert.equal(scannedItems.items[0]?.expectedQty, 10, "The original audit snapshot remains available separately");
  assert.equal(scannedItems.items[0]?.systemQty, 8, "Barcode search must return current branch stock after a prior sale");

  const beginResponse = await fetch(`${apiUrl}/api/stock-audits/begin-count`, {
    method: "POST",
    headers,
    body: JSON.stringify({ auditId: audit.id, itemId: auditItem.id }),
  });
  assert.equal(beginResponse.status, 200);
  const begin = await beginResponse.json() as { baselineQty: number; countToken: string };
  assert.equal(begin.baselineQty, 8, "Physical count must start from stock at count time");

  const saleDuringCount = await makeSale(1, `audit-during-${suffix}`);
  assert.equal(saleDuringCount.status, 200, "Sales remain allowed while an audit count is in progress");
  const staleCountResponse = await fetch(`${apiUrl}/api/stock-audits/count`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      auditId: audit.id,
      itemId: auditItem.id,
      countedQty: 8,
      finding: "NORMAL",
      countToken: begin.countToken,
    }),
  });
  assert.equal(staleCountResponse.status, 409, "A sale during the count window must invalidate that count and require recount");
  const afterConflict = await fetch(auditItemsUrl(), { headers });
  const conflictItems = await afterConflict.json() as { items: Array<{ id: string; status: string; systemQty: number }> };
  const conflictItem = conflictItems.items.find((item) => item.id === auditItem.id);
  assert.equal(conflictItem?.status, "RECOUNT_REQUIRED");
  assert.equal(conflictItem?.systemQty, 7);

  const recountResponse = await fetch(`${apiUrl}/api/stock-audits/begin-count`, {
    method: "POST",
    headers,
    body: JSON.stringify({ auditId: audit.id, itemId: auditItem.id }),
  });
  assert.equal(recountResponse.status, 200);
  const recount = await recountResponse.json() as { baselineQty: number; countToken: string };
  assert.equal(recount.baselineQty, 7);
  const saveRecount = await fetch(`${apiUrl}/api/stock-audits/count`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      auditId: audit.id,
      itemId: auditItem.id,
      countedQty: 6,
      finding: "NORMAL",
      countToken: recount.countToken,
    }),
  });
  assert.equal(saveRecount.status, 200);

  const [saleAfterCount, finalizeResponse] = await Promise.all([
    makeSale(2, `audit-after-${suffix}`),
    fetch(`${apiUrl}/api/stock-audits/finalize`, {
      method: "POST",
      headers,
      body: JSON.stringify({ auditId: audit.id }),
    }),
  ]);
  assert.equal(saleAfterCount.status, 200, "A successful sale concurrent with finalization must be accepted exactly once");
  assert.equal(finalizeResponse.status, 200, "Finalization must serialize safely with the sale");
  const finalStock = await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: auditProduct.id, branchId: auditBranch.id } },
  });
  assert.equal(finalStock.qty, 4, "Counted 6, then sold 2: final physical stock should be 4, regardless of serialization order");
  assert.equal(await prisma.sale.count({ where: { branchId: auditBranch.id, cashierId: admin.id, items: { some: { productId: auditProduct.id } } } }), 3);
  assert.equal(await prisma.adjustment.count({
    where: { branchId: auditBranch.id, reason: { contains: audit.id } },
  }), 1, "The confirmed -1 count delta must be recorded once; concurrent sales must not add a duplicate adjustment.");
});
