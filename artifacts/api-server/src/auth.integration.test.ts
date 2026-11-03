import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { io, type Socket } from "socket.io-client";

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
    data: { id: productId, name: "Auth Integration Test Product", buyingPrice: 1, sellingPrice: 2 },
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

  const port = await getAvailablePort();
  apiUrl = `http://127.0.0.1:${port}`;
  apiProcess = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: jwtSecret,
      PORT: String(port),
      NODE_ENV: "test",
    },
    stdio: "ignore",
  });
  await waitForApi();
});

after(async () => {
  for (const socket of connectedSockets) socket.close();
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill("SIGTERM");
    await Promise.race([
      once(apiProcess, "exit"),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (apiProcess.exitCode === null) apiProcess.kill("SIGKILL");
  }
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
  const cashierSales = await cashierTransactions.json() as Array<{ id: string; branchId: string }>;
  assert.equal(cashierSales.some((sale) => sale.id === otherBranchSaleId || sale.branchId === branchBId), false);

  const adminLogin = await login(admin.username, admin.password);
  assert.equal(adminLogin.status, 200);
  const adminPayload = await adminLogin.json() as { token: string };
  const adminTransactions = await fetch(`${apiUrl}/api/transactions?branchId=${encodeURIComponent(branchBId)}`, {
    headers: { authorization: `Bearer ${adminPayload.token}` },
  });
  assert.equal(adminTransactions.status, 200);
  const adminSales = await adminTransactions.json() as Array<{ id: string; branchId: string }>;
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
});
