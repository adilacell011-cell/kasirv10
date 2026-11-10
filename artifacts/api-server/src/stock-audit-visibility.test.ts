import assert from "node:assert/strict";
import test from "node:test";
import type { Application, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  NO_VISIBLE_BRANCHES,
  registerStockAuditRoutes,
  removeBranchFromVisibility,
} from "./stock-audit";

function createRouteHarness({
  visibleBranchIds = "branch-a,branch-b",
  stockQty = 0,
  itemStatus = "PENDING",
  countedQty = null,
  branchIds = ["branch-a", "branch-b", "branch-c"],
}: {
  visibleBranchIds?: string;
  stockQty?: number | null;
  itemStatus?: string;
  countedQty?: number | null;
  branchIds?: string[];
} = {}) {
  const handlers = new Map<string, (...args: any[]) => Promise<void>>();
  const updates: Array<{ model: string; data: Record<string, unknown> }> = [];
  const emitted: Array<{ branchId: string | null | undefined; event: string; payload: unknown }> = [];
  const item = {
    id: "audit-item-1",
    status: itemStatus,
    inScope: true,
    countedQty,
    notes: "Catatan hitungan sebelumnya",
  };
  let rawQueryIndex = 0;
  const tx = {
    $queryRaw: async () => {
      rawQueryIndex += 1;
      if (rawQueryIndex === 1) {
        return [{ id: "audit-1", branchId: "branch-a", status: "IN_PROGRESS" }];
      }
      if (rawQueryIndex === 2) {
        return [{ id: "product-1", status: "ACTIVE", visibleBranchIds }];
      }
      if (rawQueryIndex === 3) {
        return stockQty === null ? [] : [{ qty: stockQty }];
      }
      throw new Error(`Unexpected query number ${rawQueryIndex}`);
    },
    product: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push({ model: "product", data });
        return { id: "product-1", ...data };
      },
    },
    branch: {
      findMany: async () => branchIds.map((id) => ({ id })),
    },
    branchStockAuditItem: {
      findUnique: async () => item,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push({ model: "audit-item", data });
        return { ...item, ...data };
      },
    },
  };
  const prisma = {
    user: { findUnique: async () => ({ name: "Auditor QA", username: "audit-qa" }) },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      rawQueryIndex = 0;
      return callback(tx);
    },
  } as unknown as PrismaClient;
  const app = {
    get: (path: string, ...routeHandlers: any[]) => handlers.set(`GET ${path}`, routeHandlers.at(-1)),
    post: (path: string, ...routeHandlers: any[]) => handlers.set(`POST ${path}`, routeHandlers.at(-1)),
    patch: (path: string, ...routeHandlers: any[]) => handlers.set(`PATCH ${path}`, routeHandlers.at(-1)),
  } as unknown as Application;
  const passThrough: RequestHandler = (_req, _res, next) => next();

  registerStockAuditRoutes(app, prisma, passThrough, () => passThrough, (branchId, event, payload) => {
    emitted.push({ branchId, event, payload });
  });

  return { handlers, updates, emitted };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

async function revoke(
  harness: ReturnType<typeof createRouteHarness>,
  reason = "Tidak dijual di cabang ini",
) {
  const response = createResponse();
  await harness.handlers.get("POST /api/stock-audits/revoke-product-visibility")?.(
    {
      user: { userId: "user-1", role: "AUDIT" },
      body: { auditId: "audit-1", productId: "product-1", reason },
    },
    response,
  );
  return response;
}

test("removing the selected branch preserves visibility in other branches", async () => {
  const harness = createRouteHarness();
  const response = await revoke(harness);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { success: true });
  assert.deepEqual(harness.updates, [
    { model: "product", data: { visibleBranchIds: "branch-b" } },
    {
      model: "audit-item",
      data: {
        inScope: false,
        status: "EXCLUDED",
        finding: "NOT_SOLD_HERE",
        notes: "Catatan hitungan sebelumnya\nIzin tampil dicabut oleh Auditor QA. Alasan: Tidak dijual di cabang ini",
      },
    },
  ]);
  assert.equal(harness.emitted[0]?.branchId, "branch-a");
  assert.equal(harness.emitted[0]?.event, "productUpdated");
});

test("revoking one branch from global visibility keeps the product visible in future branches", async () => {
  const harness = createRouteHarness({ visibleBranchIds: "*" });
  const response = await revoke(harness);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(harness.updates[0]?.data, { visibleBranchIds: "!branch-a" });
});

test("a product with no other visible branches uses an explicit no-branches marker", async () => {
  const harness = createRouteHarness({ visibleBranchIds: "branch-a", branchIds: ["branch-a"] });
  const response = await revoke(harness);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(harness.updates[0]?.data, { visibleBranchIds: NO_VISIBLE_BRANCHES });
});

test("any live stock other than exactly zero blocks the revocation atomically", async () => {
  for (const stockQty of [1, -1]) {
    const harness = createRouteHarness({ stockQty });
    const response = await revoke(harness);
    assert.equal(response.statusCode, 409);
    assert.equal(harness.updates.length, 0);
    assert.equal(harness.emitted.length, 0);
  }
});

test("an in-progress count or positive physical count blocks exclusion", async () => {
  for (const options of [
    { itemStatus: "COUNTING" },
    { itemStatus: "COUNTED", countedQty: 1 },
  ]) {
    const harness = createRouteHarness(options);
    const response = await revoke(harness);
    assert.equal(response.statusCode, 409);
    assert.equal(harness.updates.length, 0);
  }
});

test("empty visibility can be removed without treating the result as global visibility", () => {
  assert.equal(
    removeBranchFromVisibility("branch-a", "branch-a"),
    NO_VISIBLE_BRANCHES,
  );
});

test("revoking from an all-branches-except rule adds another excluded branch", () => {
  assert.equal(
    removeBranchFromVisibility("!branch-b", "branch-a"),
    "!branch-b,branch-a",
  );
});
