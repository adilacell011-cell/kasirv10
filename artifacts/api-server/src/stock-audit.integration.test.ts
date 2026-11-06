import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express, { type Request, type RequestHandler } from "express";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { inspectDatabase } from "./database-readiness";
import { validateDatabaseTarget } from "./database-target";
import { registerStockAuditRoutes } from "./stock-audit";

type QaRequest = Request & { user?: { userId: string; role: string } };

type HttpResult = {
  status: number;
  body: Record<string, any> | null;
};

test("branch stock audit stays isolated, conflict-safe, and persistent", {
  skip: process.env.RUN_STOCK_AUDIT_DB_TESTS !== "1",
}, async () => {
  const target = validateDatabaseTarget(process.env);
  assert.equal(target.environment, "test");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(target.host));
  assert.match(target.database, /(?:^|[_-])(?:qa|test)(?:[_-]|$)/i);
  assert.equal(target.schema, "public");

  let prisma = new PrismaClient();
  let server: Server | undefined;
  let baseUrl = "";
  const emittedEvents: Array<{ branchId: string | null | undefined; event: string }> = [];

  const startHttp = async () => {
    const app = express();
    app.use(express.json());
    const authenticate: RequestHandler = (req, _res, next) => {
      const qaRequest = req as QaRequest;
      qaRequest.user = {
        userId: req.header("x-qa-user") ?? "",
        role: req.header("x-qa-role") ?? "",
      };
      next();
    };
    const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
      const user = (req as QaRequest).user;
      if (!user || !roles.includes(user.role)) {
        res.status(403).json({ error: "QA role denied" });
        return;
      }
      next();
    };
    registerStockAuditRoutes(app, prisma, authenticate, requireRole, (branchId, event) => {
      emittedEvents.push({ branchId, event });
    });
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  };

  const stopHttp = async () => {
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    server = undefined;
  };

  const call = async (
    path: string,
    method: string,
    userId: string,
    role: string,
    body?: Record<string, unknown>,
  ): Promise<HttpResult> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "x-qa-user": userId,
        "x-qa-role": role,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as Record<string, any> : null };
  };

  const suffix = randomUUID();
  const prismaPrefix = `qa-stock-audit-${suffix}`;
  try {
    await inspectDatabase(prisma, target);

    const [branchA, branchB, branchC] = await Promise.all([
      prisma.branch.create({ data: { name: `${prismaPrefix}-A` } }),
      prisma.branch.create({ data: { name: `${prismaPrefix}-B` } }),
      prisma.branch.create({ data: { name: `${prismaPrefix}-C` } }),
    ]);
    const [admin, auditor, secondAuditor, cashier] = await Promise.all([
      prisma.user.create({ data: { username: `${prismaPrefix}-admin`, password: "qa-only", name: "QA Owner", role: "ADMIN", branchId: null, status: "Active" } }),
      prisma.user.create({ data: { username: `${prismaPrefix}-audit-a`, password: "qa-only", name: "QA Auditor A", role: "AUDIT", branchId: null, status: "Active" } }),
      prisma.user.create({ data: { username: `${prismaPrefix}-audit-b`, password: "qa-only", name: "QA Auditor B", role: "AUDIT", branchId: null, status: "Active" } }),
      prisma.user.create({ data: { username: `${prismaPrefix}-cashier`, password: "qa-only", name: "QA Cashier", role: "CASHIER", branchId: branchA.id, status: "Active" } }),
    ]);

    const [productA, productB, productC, exceptionProduct] = await Promise.all([
      prisma.product.create({ data: { name: `${prismaPrefix}-Product-A`, barcode: `${prismaPrefix}-barcode`, buyingPrice: 1, sellingPrice: 2, visibleBranchIds: branchA.id } }),
      prisma.product.create({ data: { name: `${prismaPrefix}-Product-B`, buyingPrice: 1, sellingPrice: 2, visibleBranchIds: branchB.id } }),
      prisma.product.create({ data: { name: `${prismaPrefix}-Product-C`, buyingPrice: 1, sellingPrice: 2, visibleBranchIds: branchC.id } }),
      prisma.product.create({ data: { name: `${prismaPrefix}-Unlisted`, buyingPrice: 1, sellingPrice: 2, visibleBranchIds: branchB.id } }),
    ]);
    await prisma.productStock.createMany({
      data: [
        { productId: productA.id, branchId: branchA.id, qty: 10 },
        { productId: productB.id, branchId: branchB.id, qty: 3 },
        { productId: productC.id, branchId: branchC.id, qty: 4 },
      ],
    });

    await startHttp();

    const cashierDenied = await call("/api/stock-audits", "POST", cashier.id, "CASHIER", { branchId: branchA.id });
    assert.equal(cashierDenied.status, 403, "Cashier must not use the audit routes");

    const startA = await call("/api/stock-audits", "POST", admin.id, "ADMIN", { branchId: branchA.id });
    assert.equal(startA.status, 201);
    assert.equal(startA.body?.summary.totalProducts, 1);
    const auditAId = String(startA.body?.id);

    const listed = await call(`/api/stock-audits/items?auditId=${auditAId}&page=1&pageSize=1`, "GET", auditor.id, "AUDIT");
    assert.equal(listed.status, 200);
    assert.equal(listed.body?.items.length, 1);
    assert.equal(listed.body?.total, 1);
    assert.equal(listed.body?.items[0]?.systemQty, 10);
    const itemAId = String(listed.body?.items[0]?.id);

    await prisma.productStock.update({
      where: { productId_branchId: { productId: productA.id, branchId: branchA.id } },
      data: { qty: { decrement: 2 } },
    });
    const scanned = await call(
      `/api/stock-audits/items?auditId=${auditAId}&page=1&pageSize=10&search=${encodeURIComponent(`${prismaPrefix}-barcode`)}`,
      "GET",
      auditor.id,
      "AUDIT",
    );
    assert.equal(scanned.body?.items[0]?.barcode, `${prismaPrefix}-barcode`);
    assert.equal(scanned.body?.items[0]?.expectedQty, 10, "Audit-start snapshot remains available for reference");
    assert.equal(scanned.body?.items[0]?.systemQty, 8, "A barcode search must show the stock currently in the branch");

    const beginA1 = await call("/api/stock-audits/begin-count", "POST", auditor.id, "AUDIT", { auditId: auditAId, itemId: itemAId });
    assert.equal(beginA1.status, 200);
    assert.equal(beginA1.body?.baselineQty, 8, "Physical count baseline must use stock at count start, not audit start");
    const beginA2 = await call("/api/stock-audits/begin-count", "POST", secondAuditor.id, "AUDIT", { auditId: auditAId, itemId: itemAId });
    assert.equal(beginA2.status, 200);
    assert.notEqual(beginA2.body?.countToken, beginA1.body?.countToken, "A second begin must issue a distinct token, even in the same millisecond");
    const resumedCount = await call(`/api/stock-audits/items?auditId=${auditAId}&page=1&pageSize=10`, "GET", secondAuditor.id, "AUDIT");
    assert.equal(
      resumedCount.body?.items.find((item: { id: string }) => item.id === itemAId)?.countToken,
      beginA2.body?.countToken,
      "The active count token must be available to restore a saved browser draft after refresh",
    );

    const staleCount = await call("/api/stock-audits/count", "PATCH", auditor.id, "AUDIT", {
      auditId: auditAId, itemId: itemAId, countedQty: 8, finding: "NORMAL", countToken: beginA1.body?.countToken,
    });
    assert.equal(staleCount.status, 409, "The earlier count token must be rejected");

    await prisma.productStock.update({
      where: { productId_branchId: { productId: productA.id, branchId: branchA.id } },
      data: { qty: { decrement: 1 } },
    });
    const movedStockCount = await call("/api/stock-audits/count", "PATCH", secondAuditor.id, "AUDIT", {
      auditId: auditAId, itemId: itemAId, countedQty: 8, finding: "NORMAL", countToken: beginA2.body?.countToken,
    });
    assert.equal(movedStockCount.status, 409, "Stock movement during counting must require recount");
    const recountList = await call(`/api/stock-audits/items?auditId=${auditAId}&page=1&pageSize=10`, "GET", admin.id, "ADMIN");
    assert.equal(recountList.body?.items[0]?.status, "RECOUNT_REQUIRED");
    assert.equal((await prisma.productStock.findUniqueOrThrow({
      where: { productId_branchId: { productId: productA.id, branchId: branchA.id } },
    })).qty, 7, "A stale physical count must not overwrite stock");

    const candidates = await call(
      `/api/stock-audits/candidates?auditId=${auditAId}&search=${encodeURIComponent(`${prismaPrefix}-Unlisted`)}`,
      "GET",
      auditor.id,
      "AUDIT",
    );
    assert.equal(candidates.status, 200);
    assert.ok(candidates.body?.items.some((item: { id: string }) => item.id === exceptionProduct.id));
    const exception = await call("/api/stock-audits/exceptions", "POST", admin.id, "ADMIN", {
      auditId: auditAId, productId: exceptionProduct.id, finding: "UNLISTED_IN_BRANCH", countedQty: 1,
    });
    assert.equal(exception.status, 201);
    assert.equal((await prisma.productStock.findUnique({
      where: { productId_branchId: { productId: exceptionProduct.id, branchId: branchA.id } },
    }))?.qty ?? 0, 0, "An out-of-scope finding must not mutate stock");
    const pageAfterException = await call(`/api/stock-audits/items?auditId=${auditAId}&page=1&pageSize=1`, "GET", auditor.id, "AUDIT");
    assert.equal(pageAfterException.body?.total, 2);
    assert.equal(pageAfterException.body?.items.length, 1, "Item listing must respect pagination");

    const beginA3 = await call("/api/stock-audits/begin-count", "POST", admin.id, "ADMIN", { auditId: auditAId, itemId: itemAId });
    assert.equal(beginA3.status, 200);
    assert.equal(beginA3.body?.baselineQty, 7);
    const savedCount = await call("/api/stock-audits/count", "PATCH", admin.id, "ADMIN", {
      auditId: auditAId, itemId: itemAId, countedQty: 6, finding: "NORMAL", countToken: beginA3.body?.countToken,
    });
    assert.equal(savedCount.status, 200);
    await prisma.productStock.update({
      where: { productId_branchId: { productId: productA.id, branchId: branchA.id } },
      data: { qty: { decrement: 2 } },
    });

    const startBRequests = await Promise.all([
      call("/api/stock-audits", "POST", admin.id, "ADMIN", { branchId: branchB.id }),
      call("/api/stock-audits", "POST", auditor.id, "AUDIT", { branchId: branchB.id }),
    ]);
    assert.deepEqual(startBRequests.map((result) => result.status).sort(), [201, 409]);
    const auditB = startBRequests.find((result) => result.status === 201)!.body!;
    const startC = await call("/api/stock-audits", "POST", auditor.id, "AUDIT", { branchId: branchC.id });
    assert.equal(startC.status, 201, "Different branches may be audited independently");
    const cancelB = await call("/api/stock-audits/cancel", "POST", auditor.id, "AUDIT", { auditId: auditB.id });
    const cancelC = await call("/api/stock-audits/cancel", "POST", auditor.id, "AUDIT", { auditId: startC.body?.id });
    assert.equal(cancelB.status, 200);
    assert.equal(cancelC.status, 200);
    assert.equal((await prisma.productStock.findUniqueOrThrow({
      where: { productId_branchId: { productId: productB.id, branchId: branchB.id } },
    })).qty, 3, "Cancelling an audit must not change stock");

    const startC2 = await call("/api/stock-audits", "POST", admin.id, "ADMIN", { branchId: branchC.id });
    assert.equal(startC2.status, 201);
    const itemsC = await call(`/api/stock-audits/items?auditId=${startC2.body?.id}&page=1&pageSize=10`, "GET", auditor.id, "AUDIT");
    const itemCId = String(itemsC.body?.items[0]?.id);
    const beginC = await call("/api/stock-audits/begin-count", "POST", auditor.id, "AUDIT", {
      auditId: String(startC2.body?.id), itemId: itemCId,
    });
    assert.equal(beginC.status, 200);
    const savedC = await call("/api/stock-audits/count", "PATCH", auditor.id, "AUDIT", {
      auditId: String(startC2.body?.id), itemId: itemCId, countedQty: 3, finding: "NORMAL", countToken: beginC.body?.countToken,
    });
    assert.equal(savedC.status, 200);
    await prisma.productStock.update({
      where: { productId_branchId: { productId: productC.id, branchId: branchC.id } },
      data: { qty: 0 },
    });
    const unsafeFinalize = await call("/api/stock-audits/finalize", "POST", admin.id, "ADMIN", { auditId: startC2.body?.id });
    assert.equal(unsafeFinalize.status, 409, "Finalization must reject a delta that would drive current stock negative");
    assert.equal((await prisma.productStock.findUniqueOrThrow({
      where: { productId_branchId: { productId: productC.id, branchId: branchC.id } },
    })).qty, 0);
    const cancelC2 = await call("/api/stock-audits/cancel", "POST", admin.id, "ADMIN", { auditId: startC2.body?.id });
    assert.equal(cancelC2.status, 200);

    const finalized = await call("/api/stock-audits/finalize", "POST", admin.id, "ADMIN", { auditId: auditAId });
    assert.equal(finalized.status, 200);
    assert.equal(finalized.body?.changedProducts, 1);
    assert.equal((await prisma.productStock.findUniqueOrThrow({
      where: { productId_branchId: { productId: productA.id, branchId: branchA.id } },
    })).qty, 4, "Finalization must preserve the sale after count, then apply the confirmed -1 delta to current stock");
    const completedItems = await call(`/api/stock-audits/items?auditId=${auditAId}&page=1&pageSize=10`, "GET", admin.id, "ADMIN");
    const completedItem = completedItems.body?.items.find((item: { id: string }) => item.id === itemAId);
    assert.equal(completedItem?.systemQty, 7, "A completed audit must retain the system quantity at the successful count time, not show later stock movements.");
    const auditAdjustments = await prisma.adjustment.count({
      where: { branchId: branchA.id, reason: { startsWith: `Audit Stok Cabang ${branchA.id} (` } },
    });
    assert.equal(auditAdjustments, 1);
    assert.equal((await call("/api/stock-audits/finalize", "POST", admin.id, "ADMIN", { auditId: auditAId })).status, 409);
    assert.equal(await prisma.adjustment.count({
      where: { branchId: branchA.id, reason: { startsWith: `Audit Stok Cabang ${branchA.id} (` } },
    }), 1, "Repeated finalization must not write a second adjustment");

    const restartAudit = await call(`/api/stock-audits/current?branchId=${branchA.id}`, "GET", admin.id, "ADMIN");
    assert.equal(restartAudit.status, 200);
    assert.equal(restartAudit.body?.status, "COMPLETED");
    await stopHttp();
    await prisma.$disconnect();
    prisma = new PrismaClient();
    await inspectDatabase(prisma, target);
    await startHttp();
    const afterRestart = await call(`/api/stock-audits/current?branchId=${branchA.id}`, "GET", admin.id, "ADMIN");
    assert.equal(afterRestart.status, 200);
    assert.equal(afterRestart.body?.id, auditAId);
    assert.equal(afterRestart.body?.status, "COMPLETED");
    assert.ok(emittedEvents.some((event) => event.branchId === branchA.id && event.event === "stockUpdated"));
  } finally {
    await stopHttp();
    await prisma.$disconnect();
  }
});
