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
  const retiredStockRequestResponse = await fetch(`${apiUrl}/api/stock-transfers/requests`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierBPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sourceBranchId: branchAId, productId, qty: 1 }),
  });
  assert.equal(retiredStockRequestResponse.status, 410);
  assert.equal(
    (await retiredStockRequestResponse.json() as { code: string }).code,
    "STOCK_REQUESTS_RETIRED",
  );
  const createLegacyRequest = (requestedProductId: string, qty: number, note?: string) =>
    prisma.stockTransfer.create({
      data: {
        productId: requestedProductId,
        sourceBranchId: branchAId,
        targetBranchId: branchBId,
        kind: "REQUEST",
        status: "REQUESTED",
        requestedQty: qty,
        requestNote: note,
        requestedById: cashierB.id,
      },
    });

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

  const globalStockInputBeforeTest = await prisma.globalConfig.findUnique({
    where: { id: "default" },
    select: { allowCashierStockInput: true },
  });
  const originalGlobalStockInput = globalStockInputBeforeTest?.allowCashierStockInput ?? true;
  const setGlobalStockInput = async (allowCashierStockInput: boolean) => {
    const response = await fetch(`${apiUrl}/api/config`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminPayload.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ allowCashierStockInput }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  await setGlobalStockInput(true);

  const permissionEvent = new Promise<{ branchId: string; allowEmployeeInput: boolean }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Branch stock-input permission event was not emitted.")), 4_000);
    cashierASocket.once(
      "branchStockInputPermissionUpdated",
      (event: { branchId: string; allowEmployeeInput: boolean }) => {
        clearTimeout(timeout);
        resolve(event);
      },
    );
  });
  const lockBranchStockInput = await fetch(`${apiUrl}/api/branches/${branchAId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ allowEmployeeInput: false }),
  });
  assert.equal(lockBranchStockInput.status, 200);
  assert.deepEqual(await permissionEvent, { branchId: branchAId, allowEmployeeInput: false });
  const adjustmentCountBeforeLockedAttempt = await prisma.adjustment.count({
    where: { productId, branchId: branchAId },
  });
  const lockedCashierStockInput = await fetch(`${apiUrl}/api/stocks/adjust`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productId, branchId: branchAId, qty: 1, type: "STOCK_IN" }),
  });
  assert.equal(lockedCashierStockInput.status, 403);
  assert.equal((await lockedCashierStockInput.json() as { code: string }).code, "CASHIER_STOCK_INPUT_LOCKED");
  assert.equal(
    await prisma.adjustment.count({ where: { productId, branchId: branchAId } }),
    adjustmentCountBeforeLockedAttempt,
    "A rejected cashier stock input must not write an adjustment.",
  );
  const unaffectedBranch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchBId },
    select: { allowEmployeeInput: true },
  });
  assert.notEqual(unaffectedBranch.allowEmployeeInput, false);

  const unlockBranchStockInput = await fetch(`${apiUrl}/api/branches/${branchAId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ allowEmployeeInput: true }),
  });
  assert.equal(unlockBranchStockInput.status, 200);
  const allowedCashierStockInput = await fetch(`${apiUrl}/api/stocks/adjust`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productId, branchId: branchAId, qty: 1, type: "STOCK_IN" }),
  });
  assert.equal(allowedCashierStockInput.status, 200);

  await setGlobalStockInput(false);
  const globallyLockedCashierStockInput = await fetch(`${apiUrl}/api/stocks/adjust`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productId, branchId: branchAId, qty: 1, type: "STOCK_IN" }),
  });
  assert.equal(globallyLockedCashierStockInput.status, 403);
  assert.equal((await globallyLockedCashierStockInput.json() as { code: string }).code, "CASHIER_STOCK_INPUT_LOCKED");
  await setGlobalStockInput(originalGlobalStockInput);

  await prisma.productStock.upsert({
    where: { productId_branchId: { productId, branchId: branchAId } },
    create: { productId, branchId: branchAId, qty: 5 },
    update: { qty: 5 },
  });
  await prisma.productStock.upsert({
    where: { productId_branchId: { productId, branchId: branchBId } },
    create: { productId, branchId: branchBId, qty: 0 },
    update: { qty: 0 },
  });
  const cashierBShiftResponse = await fetch(`${apiUrl}/api/shifts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierBPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      initialCash: 0,
      shiftDate: new Date().toISOString().slice(0, 10),
      shiftType: "Pagi",
    }),
  });
  assert.equal(cashierBShiftResponse.status, 200);
  const cashierBShift = await cashierBShiftResponse.json() as { id: string };

  const transferRequest = await createLegacyRequest(productId, 3, "Stok cabang B menipis.");
  assert.equal(transferRequest.status, "REQUESTED");
  assert.equal(transferRequest.requestedQty, 3);
  assert.equal(transferRequest.sourceBranchId, branchAId);
  assert.equal(transferRequest.targetBranchId, branchBId);
  assert.deepEqual(
    await prisma.productStock.findMany({ where: { productId }, orderBy: { branchId: "asc" }, select: { branchId: true, qty: true } }),
    [{ branchId: branchAId, qty: 5 }, { branchId: branchBId, qty: 0 }].sort((a, b) => a.branchId.localeCompare(b.branchId)),
    "A request must not change either branch's stock.",
  );

  const sourceTransferList = await fetch(`${apiUrl}/api/stock-transfers`, {
    headers: { authorization: `Bearer ${cashierPayload.token}` },
  });
  assert.equal(sourceTransferList.status, 200);
  assert.ok((await sourceTransferList.json() as { items: Array<{ id: string }> }).items.some((item) => item.id === transferRequest.id));
  const hiddenTransferList = await fetch(`${apiUrl}/api/stock-transfers`, {
    headers: { authorization: `Bearer ${cashierBPayload.token}` },
  });
  assert.equal(hiddenTransferList.status, 200);
  assert.ok((await hiddenTransferList.json() as { items: Array<{ id: string }> }).items.some((item) => item.id === transferRequest.id));

  const acceptTransferResponse = await fetch(`${apiUrl}/api/stock-transfers/${transferRequest.id}/respond`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "ACCEPT", qty: 2, note: "Dapat dikirim dua pcs." }),
  });
  assert.equal(acceptTransferResponse.status, 200);
  assert.equal((await acceptTransferResponse.json() as { status: string; approvedQty: number }).status, "ACCEPTED");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 5, "Accepting a request must not reserve or decrement stock.");

  const wrongReceiverResponse = await fetch(`${apiUrl}/api/stock-transfers/${transferRequest.id}/receive`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ receivedQty: 2 }),
  });
  assert.equal(wrongReceiverResponse.status, 403, "Only the destination cashier can confirm receipt.");

  const dispatchTransferResponse = await fetch(`${apiUrl}/api/stock-transfers/${transferRequest.id}/dispatch`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(dispatchTransferResponse.status, 200);
  assert.equal((await dispatchTransferResponse.json() as { status: string; dispatchedQty: number }).status, "IN_TRANSIT");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 3);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchBId } },
  })).qty, 0, "Dispatch reduces the source but does not add stock to the destination.");
  const duplicateDispatchResponse = await fetch(`${apiUrl}/api/stock-transfers/${transferRequest.id}/dispatch`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(duplicateDispatchResponse.status, 409);

  const missingDiscrepancyResponse = await fetch(`${apiUrl}/api/stock-transfers/${transferRequest.id}/receive`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierBPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ receivedQty: 1 }),
  });
  assert.equal(missingDiscrepancyResponse.status, 400, "A partial receipt must include a discrepancy note.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchBId } },
  })).qty, 0);

  const receiveTransferResponse = await fetch(`${apiUrl}/api/stock-transfers/${transferRequest.id}/receive`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierBPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ receivedQty: 1, discrepancyNote: "Satu pcs tidak ada di paket." }),
  });
  assert.equal(receiveTransferResponse.status, 200);
  const receivedTransfer = await receiveTransferResponse.json() as {
    status: string; receivedQty: number; discrepancyNote: string;
  };
  assert.equal(receivedTransfer.status, "RECEIVED");
  assert.equal(receivedTransfer.receivedQty, 1);
  assert.equal(receivedTransfer.discrepancyNote, "Satu pcs tidak ada di paket.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchBId } },
  })).qty, 1);
  const duplicateReceiveResponse = await fetch(`${apiUrl}/api/stock-transfers/${transferRequest.id}/receive`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierBPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ receivedQty: 1 }),
  });
  assert.equal(duplicateReceiveResponse.status, 409);

  const directTransferResponse = await fetch(`${apiUrl}/api/stocks/transfer`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productId, qty: 1, sourceBranchId: branchAId, targetBranchId: branchBId }),
  });
  assert.equal(directTransferResponse.status, 201);
  const directTransfer = await directTransferResponse.json() as { id: string; status: string };
  assert.equal(directTransfer.status, "IN_TRANSIT");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 2);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchBId } },
  })).qty, 1, "Direct send must also wait for destination receipt.");

  const directReceiveResponse = await fetch(`${apiUrl}/api/stock-transfers/${directTransfer.id}/receive`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierBPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ receivedQty: 1 }),
  });
  assert.equal(directReceiveResponse.status, 200);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchBId } },
  })).qty, 2);

  const batchProduct = await prisma.product.create({
    data: {
      name: "Batch Transfer Product",
      buyingPrice: 10000,
      sellingPrice: 15000,
    },
  });
  await prisma.productStock.upsert({
    where: { productId_branchId: { productId, branchId: branchAId } },
    create: { productId, branchId: branchAId, qty: 6 },
    update: { qty: 6 },
  });
  await prisma.productStock.upsert({
    where: { productId_branchId: { productId: batchProduct.id, branchId: branchAId } },
    create: { productId: batchProduct.id, branchId: branchAId, qty: 4 },
    update: { qty: 4 },
  });
  await prisma.productStock.upsert({
    where: { productId_branchId: { productId: batchProduct.id, branchId: branchBId } },
    create: { productId: batchProduct.id, branchId: branchBId, qty: 0 },
    update: { qty: 0 },
  });
  const batchResponse = await fetch(`${apiUrl}/api/stocks/transfer-batch`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      targetBranchId: branchBId,
      items: [{ productId, qty: 2 }, { productId: batchProduct.id, qty: 1 }],
      note: "Kirim beberapa produk sekaligus.",
    }),
  });
  assert.equal(batchResponse.status, 201);
  const batch = await batchResponse.json() as {
    batchId: string;
    items: Array<{ id: string; batchId: string; status: string; productId: string; dispatchedQty: number }>;
  };
  assert.ok(batch.batchId);
  assert.equal(batch.items.length, 2);
  assert.ok(batch.items.every((item) => item.batchId === batch.batchId && item.status === "IN_TRANSIT"));
  assert.deepEqual(batch.items.map((item) => item.dispatchedQty).sort(), [1, 2]);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 4);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: batchProduct.id, branchId: branchAId } },
  })).qty, 3);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchBId } },
  })).qty, 2, "Batch dispatch does not increase destination stock before receipt.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: batchProduct.id, branchId: branchBId } },
  })).qty, 0);

  const failedBatchResponse = await fetch(`${apiUrl}/api/stocks/transfer-batch`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      targetBranchId: branchBId,
      items: [{ productId, qty: 1 }, { productId: batchProduct.id, qty: 4 }],
    }),
  });
  assert.equal(failedBatchResponse.status, 409);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 4, "An insufficient item leaves every source item unchanged.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: batchProduct.id, branchId: branchAId } },
  })).qty, 3);

  const wrongBatchReceiver = await fetch(
    `${apiUrl}/api/stock-transfers/batches/${batch.batchId}/receive`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  assert.equal(wrongBatchReceiver.status, 403, "Only the destination cashier can confirm the batch.");
  const batchReceiptResponse = await fetch(
    `${apiUrl}/api/stock-transfers/batches/${batch.batchId}/receive`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  assert.equal(batchReceiptResponse.status, 200);
  assert.equal((await batchReceiptResponse.json() as { items: unknown[] }).items.length, 2);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchBId } },
  })).qty, 4);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: batchProduct.id, branchId: branchBId } },
  })).qty, 1);
  const duplicateBatchReceipt = await fetch(
    `${apiUrl}/api/stock-transfers/batches/${batch.batchId}/receive`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  assert.equal(duplicateBatchReceipt.status, 409);

  const postBatch = (token: string, body: unknown) => fetch(`${apiUrl}/api/stocks/transfer-batch`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal((await fetch(`${apiUrl}/api/stocks/transfer-batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetBranchId: branchBId, items: [{ productId, qty: 1 }] }),
  })).status, 401, "Batch sends require an authenticated user.");
  const invalidPayloads: unknown[] = [
    { targetBranchId: branchBId, items: [] },
    { targetBranchId: branchBId, items: Array.from({ length: 51 }, (_, index) => ({ productId: `not-real-${index}`, qty: 1 })) },
    { targetBranchId: branchBId, items: [{ productId, qty: 1 }, { productId, qty: 1 }] },
    { targetBranchId: branchBId, items: [{ productId, qty: 0 }] },
    { targetBranchId: branchBId, items: [{ productId, qty: 1.5 }] },
    { targetBranchId: branchBId, items: [{ productId, qty: -1 }] },
    { targetBranchId: branchBId, items: [{ productId, qty: 1 }], note: "x".repeat(501) },
  ];
  for (const payload of invalidPayloads) {
    assert.equal((await postBatch(cashierPayload.token, payload)).status, 400);
  }
  assert.equal((await postBatch(cashierPayload.token, {
    sourceBranchId: branchBId,
    targetBranchId: branchAId,
    items: [{ productId, qty: 1 }],
  })).status, 403, "A cashier cannot spoof a different source branch.");
  assert.equal((await postBatch(cashierPayload.token, {
    targetBranchId: branchAId,
    items: [{ productId, qty: 1 }],
  })).status, 400, "A branch cannot transfer to itself.");
  assert.equal((await postBatch(cashierPayload.token, {
    targetBranchId: "missing-transfer-branch",
    items: [{ productId, qty: 1 }],
  })).status, 404, "Unknown destination branches are rejected.");

  const batchHiddenProduct = await prisma.product.create({
    data: { name: "Hidden From Transfer Destination", buyingPrice: 1000, sellingPrice: 2000, visibleBranchIds: branchAId },
  });
  await prisma.productStock.createMany({
    data: [
      { productId: batchHiddenProduct.id, branchId: branchAId, qty: 4 },
      { productId: batchHiddenProduct.id, branchId: branchBId, qty: 0 },
    ],
  });
  const baseStockBeforeHiddenBatch = (await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty;
  const hiddenProductBatch = await postBatch(cashierPayload.token, {
    targetBranchId: branchBId,
    items: [{ productId, qty: 1 }, { productId: batchHiddenProduct.id, qty: 1 }],
  });
  assert.equal(hiddenProductBatch.status, 409);
  assert.equal((await hiddenProductBatch.json() as { code: string }).code, "PRODUCT_HIDDEN_IN_TARGET");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, baseStockBeforeHiddenBatch, "A hidden product prevents every line in the batch from dispatching.");
  await prisma.product.update({ where: { id: batchHiddenProduct.id }, data: { visibleBranchIds: "*", status: "INACTIVE" } });
  assert.equal((await postBatch(cashierPayload.token, {
    targetBranchId: branchBId,
    items: [{ productId: batchHiddenProduct.id, qty: 1 }],
  })).status, 409, "Inactive products cannot be transferred.");

  await prisma.shift.update({ where: { id: activeShift.id }, data: { status: "closed" } });
  const closedShiftBatch = await postBatch(cashierPayload.token, {
    targetBranchId: branchBId,
    items: [{ productId, qty: 1 }],
  });
  assert.equal(closedShiftBatch.status, 409, "Cashiers cannot dispatch without an open shift.");
  await prisma.shift.update({ where: { id: activeShift.id }, data: { status: "open" } });

  const maxBatchProductIds = Array.from({ length: 50 }, (_, index) => `qa-max-batch-${branchAId}-${index}`);
  await prisma.product.createMany({
    data: maxBatchProductIds.map((id, index) => ({
      id,
      name: `Maximum batch QA product ${index}`,
      buyingPrice: 1000,
      sellingPrice: 2000,
    })),
  });
  await prisma.productStock.createMany({
    data: maxBatchProductIds.map((maxProductId) => ({
      productId: maxProductId,
      branchId: branchAId,
      qty: 1,
    })),
  });
  const maximumBatchResponse = await postBatch(cashierPayload.token, {
    targetBranchId: branchBId,
    items: maxBatchProductIds.map((maxProductId) => ({ productId: maxProductId, qty: 1 })),
  });
  assert.equal(maximumBatchResponse.status, 201, "A batch at the 50-product limit is accepted.");
  const maximumBatch = await maximumBatchResponse.json() as { batchId: string; items: Array<{ id: string }> };
  assert.equal(maximumBatch.items.length, 50);
  const maximumBatchReceipt = await fetch(`${apiUrl}/api/stock-transfers/batches/${maximumBatch.batchId}/receive`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(maximumBatchReceipt.status, 200);
  assert.equal((await maximumBatchReceipt.json() as { items: unknown[] }).items.length, 50);
  assert.equal(await prisma.adjustment.count({
    where: { reason: { contains: maximumBatch.batchId } },
  }), 100, "Each line keeps a source and destination stock audit entry.");

  const raceProduct = await prisma.product.create({
    data: { name: "Concurrent Batch QA Product", buyingPrice: 1000, sellingPrice: 2000 },
  });
  await prisma.productStock.createMany({
    data: [
      { productId: raceProduct.id, branchId: branchAId, qty: 5 },
      { productId: raceProduct.id, branchId: branchBId, qty: 0 },
    ],
  });
  const concurrentSends = await Promise.all([
    postBatch(cashierPayload.token, { targetBranchId: branchBId, items: [{ productId: raceProduct.id, qty: 4 }] }),
    postBatch(cashierPayload.token, { targetBranchId: branchBId, items: [{ productId: raceProduct.id, qty: 4 }] }),
  ]);
  assert.deepEqual(concurrentSends.map((response) => response.status).sort(), [201, 409]);
  const successfulSend = concurrentSends.find((response) => response.status === 201);
  assert.ok(successfulSend);
  const raceBatch = await successfulSend.json() as { batchId: string; items: Array<{ id: string }> };
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: raceProduct.id, branchId: branchAId } },
  })).qty, 1, "Concurrent sends cannot oversell the source branch.");
  const concurrentReceipts = await Promise.all([
    fetch(`${apiUrl}/api/stock-transfers/batches/${raceBatch.batchId}/receive`, {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    fetch(`${apiUrl}/api/stock-transfers/batches/${raceBatch.batchId}/receive`, {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
  ]);
  assert.deepEqual(concurrentReceipts.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: raceProduct.id, branchId: branchBId } },
  })).qty, 4, "Concurrent duplicate receipts add stock exactly once.");

  const batchRecordedProduct = await prisma.product.create({
    data: { name: "Batch SKU Mistake Recorded Product", buyingPrice: 1000, sellingPrice: 2000 },
  });
  const batchActualProduct = await prisma.product.create({
    data: { name: "Batch SKU Mistake Actual Product", buyingPrice: 1000, sellingPrice: 2000 },
  });
  const batchNormalProduct = await prisma.product.create({
    data: { name: "Batch SKU Normal Product", buyingPrice: 1000, sellingPrice: 2000 },
  });
  await prisma.productStock.createMany({
    data: [
      { productId: batchRecordedProduct.id, branchId: branchAId, qty: 3 },
      { productId: batchRecordedProduct.id, branchId: branchBId, qty: 0 },
      { productId: batchActualProduct.id, branchId: branchAId, qty: 3 },
      { productId: batchActualProduct.id, branchId: branchBId, qty: 0 },
      { productId: batchNormalProduct.id, branchId: branchAId, qty: 5 },
      { productId: batchNormalProduct.id, branchId: branchBId, qty: 0 },
    ],
  });
  const skuExceptionBatchResponse = await postBatch(cashierPayload.token, {
    targetBranchId: branchBId,
    items: [
      { productId: batchRecordedProduct.id, qty: 1 },
      { productId: batchNormalProduct.id, qty: 2 },
    ],
  });
  assert.equal(skuExceptionBatchResponse.status, 201);
  const skuExceptionBatch = await skuExceptionBatchResponse.json() as {
    batchId: string;
    items: Array<{ id: string; productId: string }>;
  };
  const recordedTransfer = skuExceptionBatch.items.find((item) => item.productId === batchRecordedProduct.id);
  const normalTransfer = skuExceptionBatch.items.find((item) => item.productId === batchNormalProduct.id);
  assert.ok(recordedTransfer && normalTransfer);
  const skuReportResponse = await fetch(
    `${apiUrl}/api/stock-transfers/${recordedTransfer.id}/sku-corrections`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({ actualProductId: batchActualProduct.id, actualQty: 1, note: "Produk fisik sesuai, SKU tercatat keliru." }),
    },
  );
  assert.equal(skuReportResponse.status, 201);
  const skuReport = await skuReportResponse.json() as { skuCorrections: Array<{ id: string }> };
  const batchCorrectionId = skuReport.skuCorrections[0]?.id;
  assert.ok(batchCorrectionId);
  const bulkWithPendingCorrection = await fetch(
    `${apiUrl}/api/stock-transfers/batches/${skuExceptionBatch.batchId}/receive`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  assert.equal(bulkWithPendingCorrection.status, 409);
  assert.equal((await bulkWithPendingCorrection.json() as { code: string }).code, "SKU_CORRECTION_PENDING");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: batchNormalProduct.id, branchId: branchBId } },
  })).qty, 0, "A pending SKU correction blocks the whole grouped receipt.");
  const approveBatchCorrection = await fetch(
    `${apiUrl}/api/stock-transfers/${recordedTransfer.id}/sku-corrections/${batchCorrectionId}`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${cashierPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    },
  );
  assert.equal(approveBatchCorrection.status, 200);
  const receiveCorrectedSku = await fetch(
    `${apiUrl}/api/stock-transfers/${recordedTransfer.id}/sku-corrections/${batchCorrectionId}/receive`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  assert.equal(receiveCorrectedSku.status, 200);
  const bulkAfterPerLineCorrection = await fetch(
    `${apiUrl}/api/stock-transfers/batches/${skuExceptionBatch.batchId}/receive`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  assert.equal(bulkAfterPerLineCorrection.status, 409, "A mixed batch must not partially confirm remaining lines.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: batchNormalProduct.id, branchId: branchBId } },
  })).qty, 0);
  const receiveRemainingBatchLine = await fetch(`${apiUrl}/api/stock-transfers/${normalTransfer.id}/receive`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({ receivedQty: 2 }),
  });
  assert.equal(receiveRemainingBatchLine.status, 200);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: batchNormalProduct.id, branchId: branchBId } },
  })).qty, 2);

  await prisma.productStock.update({
    where: { productId_branchId: { productId, branchId: branchAId } },
    data: { qty: 2 },
  });
  await prisma.productStock.update({
    where: { productId_branchId: { productId, branchId: branchBId } },
    data: { qty: 2 },
  });

  const actualSkuProduct = await prisma.product.create({
    data: {
      name: "Transfer Actual SKU Product",
      buyingPrice: 10000,
      sellingPrice: 15000,
    },
  });
  await prisma.productStock.createMany({
    data: [
      { productId: actualSkuProduct.id, branchId: branchAId, qty: 4 },
      { productId: actualSkuProduct.id, branchId: branchBId, qty: 0 },
    ],
  });
  const wrongSkuRequest = await createLegacyRequest(productId, 1);
  const acceptWrongSkuRequest = await fetch(`${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/respond`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "ACCEPT", qty: 1 }),
  });
  assert.equal(acceptWrongSkuRequest.status, 200);
  const dispatchWrongSkuRequest = await fetch(`${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/dispatch`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(dispatchWrongSkuRequest.status, 200);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 1, "The recorded SKU is decremented when the source dispatches.");

  const wrongBranchSkuReport = await fetch(`${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/sku-corrections`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({ actualProductId: actualSkuProduct.id, actualQty: 1, note: "SKU actual 3GB." }),
  });
  assert.equal(wrongBranchSkuReport.status, 403, "Only the destination cashier can report the actual SKU.");
  const reportWrongSku = await fetch(`${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/sku-corrections`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({ actualProductId: actualSkuProduct.id, actualQty: 1, note: "Kasir memilih SKU 2GB; yang diserahkan 3GB." }),
  });
  assert.equal(reportWrongSku.status, 201);
  const reportedWrongSku = await reportWrongSku.json() as {
    id: string;
    status: string;
    skuCorrections: Array<{ id: string; status: string }>;
  };
  const firstCorrectionId = reportedWrongSku.skuCorrections[0]?.id;
  assert.ok(firstCorrectionId);
  assert.equal(reportedWrongSku.status, "IN_TRANSIT");
  assert.equal(reportedWrongSku.skuCorrections[0]?.status, "PENDING_SOURCE");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: actualSkuProduct.id, branchId: branchBId } },
  })).qty, 0, "Reporting the actual SKU must not add stock before the sender reviews it.");

  const normalReceiptWhileSkuCorrection = await fetch(`${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/receive`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({ receivedQty: 1 }),
  });
  assert.equal(normalReceiptWhileSkuCorrection.status, 409, "A SKU correction must use the correction receipt flow.");
  const rejectWrongSkuCorrection = await fetch(
    `${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/sku-corrections/${firstCorrectionId}`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${cashierPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "REJECT", responseNote: "Periksa ulang, laporan belum sesuai." }),
    },
  );
  assert.equal(rejectWrongSkuCorrection.status, 200);
  const rejectedSkuCorrection = await rejectWrongSkuCorrection.json() as {
    status: string;
    skuCorrections: Array<{ status: string }>;
  };
  assert.equal(rejectedSkuCorrection.status, "IN_TRANSIT");
  assert.equal(rejectedSkuCorrection.skuCorrections[0]?.status, "REJECTED");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 1, "Rejecting a correction must not restore or decrement the source's recorded SKU.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: actualSkuProduct.id, branchId: branchAId } },
  })).qty, 4, "Rejecting a correction must not alter the source's actual SKU.");

  const resubmitWrongSku = await fetch(`${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/sku-corrections`, {
    method: "POST",
    headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
    body: JSON.stringify({ actualProductId: actualSkuProduct.id, actualQty: 1, note: "Barang fisik sudah dicek ulang." }),
  });
  assert.equal(resubmitWrongSku.status, 201, "A rejected report can be corrected and submitted again.");
  const resubmittedWrongSku = await resubmitWrongSku.json() as {
    skuCorrections: Array<{ id: string; status: string }>;
  };
  const approvedCorrectionId = resubmittedWrongSku.skuCorrections[0]?.id;
  assert.ok(approvedCorrectionId);
  const wrongBranchSkuApproval = await fetch(
    `${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/sku-corrections/${approvedCorrectionId}`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    },
  );
  assert.equal(wrongBranchSkuApproval.status, 403, "Only the source cashier can approve a SKU correction.");
  const approveWrongSkuCorrection = await fetch(
    `${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/sku-corrections/${approvedCorrectionId}`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${cashierPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "APPROVE", responseNote: "Dikonfirmasi cabang pengirim." }),
    },
  );
  assert.equal(approveWrongSkuCorrection.status, 200);
  const approvedSkuCorrection = await approveWrongSkuCorrection.json() as {
    status: string;
    receivedQty: number | null;
    skuCorrections: Array<{ status: string }>;
  };
  assert.equal(approvedSkuCorrection.status, "IN_TRANSIT");
  assert.equal(approvedSkuCorrection.receivedQty, null);
  assert.equal(approvedSkuCorrection.skuCorrections[0]?.status, "APPROVED_PENDING_RECEIPT");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 2, "Source approval restores the SKU recorded by mistake.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: actualSkuProduct.id, branchId: branchAId } },
  })).qty, 3, "Source approval decrements the actual SKU that was sent.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: actualSkuProduct.id, branchId: branchBId } },
  })).qty, 0, "Source approval still waits for destination confirmation.");

  const confirmActualSkuReceipt = await fetch(
    `${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/sku-corrections/${approvedCorrectionId}/receive`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  assert.equal(confirmActualSkuReceipt.status, 200);
  const receivedActualSku = await confirmActualSkuReceipt.json() as {
    status: string;
    receivedQty: number;
    skuCorrections: Array<{ status: string }>;
  };
  assert.equal(receivedActualSku.status, "RECEIVED");
  assert.equal(receivedActualSku.receivedQty, 1);
  assert.equal(receivedActualSku.skuCorrections[0]?.status, "RECEIVED");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 2, "The original SKU remains restored at the source.");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: actualSkuProduct.id, branchId: branchAId } },
  })).qty, 3);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: actualSkuProduct.id, branchId: branchBId } },
  })).qty, 1, "The actual SKU is added to the destination only after its confirmation.");
  const duplicateSkuReceipt = await fetch(
    `${apiUrl}/api/stock-transfers/${wrongSkuRequest.id}/sku-corrections/${approvedCorrectionId}/receive`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cashierBPayload.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  assert.equal(duplicateSkuReceipt.status, 409, "A correction receipt cannot be applied twice.");

  const rejectedRequest = await createLegacyRequest(productId, 4);
  const rejectTransferResponse = await fetch(`${apiUrl}/api/stock-transfers/${rejectedRequest.id}/respond`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "REJECT", note: "Stok cabang sumber belum cukup." }),
  });
  assert.equal(rejectTransferResponse.status, 200);
  assert.equal((await rejectTransferResponse.json() as { status: string }).status, "REJECTED");

  const cancelRequest = await createLegacyRequest(productId, 2);
  const overRequestApproval = await fetch(`${apiUrl}/api/stock-transfers/${cancelRequest.id}/respond`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "ACCEPT", qty: 3 }),
  });
  assert.equal(overRequestApproval.status, 400);
  const acceptForCancellation = await fetch(`${apiUrl}/api/stock-transfers/${cancelRequest.id}/respond`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "ACCEPT", qty: 1 }),
  });
  assert.equal(acceptForCancellation.status, 200);
  const cancelAcceptedTransfer = await fetch(`${apiUrl}/api/stock-transfers/${cancelRequest.id}/cancel`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${cashierBPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ note: "Cabang sudah menerima stok dari sumber lain." }),
  });
  assert.equal(cancelAcceptedTransfer.status, 200);
  assert.equal((await cancelAcceptedTransfer.json() as { status: string }).status, "CANCELLED");
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchAId } },
  })).qty, 2);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId: branchBId } },
  })).qty, 2, "Rejecting or cancelling before dispatch must not change stock.");

  const hiddenProduct = await prisma.product.create({
    data: {
      name: "Hidden Transfer Product",
      buyingPrice: 10000,
      sellingPrice: 15000,
      visibleBranchIds: branchAId,
    },
  });
  await prisma.productStock.create({
    data: { productId: hiddenProduct.id, branchId: branchAId, qty: 2 },
  });
  const hiddenProductTransferResponse = await fetch(`${apiUrl}/api/stocks/transfer`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productId: hiddenProduct.id, qty: 1, targetBranchId: branchBId }),
  });
  assert.equal(hiddenProductTransferResponse.status, 409);
  assert.equal((await prisma.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId: hiddenProduct.id, branchId: branchAId } },
  })).qty, 2, "A product hidden from the destination must not be transferred there.");

  const closeCashierBShift = await fetch(`${apiUrl}/api/shifts/${cashierBShift.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${cashierBPayload.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "closed", reportedIncome: 0 }),
  });
  assert.equal(closeCashierBShift.status, 200);
  // This temporary shift exists only to exercise the transfer flow; remove it
  // so the later user-deletion test remains about an account without history.
  await prisma.shift.delete({ where: { id: cashierBShift.id } });

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
