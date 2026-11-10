import assert from "node:assert/strict";
import test from "node:test";
import type { Application, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  findNonZeroBranchStocks,
  isProductVisibleInBranch,
  registerProductLifecycleRoutes,
} from "./product-lifecycle";

test("deactivation requires zero stock in every branch, including branches where the product is hidden", () => {
  const stocks = [
    { branchId: "visible-zero", qty: 0, visible: true },
    { branchId: "visible-stock", qty: 3, visible: true },
    { branchId: "hidden-stock", qty: 2, visible: false },
  ];

  assert.deepEqual(
    findNonZeroBranchStocks(stocks).map(({ branchId, qty }) => ({ branchId, qty })),
    [
      { branchId: "visible-stock", qty: 3 },
      { branchId: "hidden-stock", qty: 2 },
    ],
  );
});

test("negative stock also blocks deactivation instead of being treated as zero", () => {
  assert.deepEqual(
    findNonZeroBranchStocks([
      { branchId: "zero", qty: 0 },
      { branchId: "negative", qty: -1 },
    ]),
    [{ branchId: "negative", qty: -1 }],
  );
});

test("an explicit no-branches visibility value hides products from every branch", () => {
  assert.equal(isProductVisibleInBranch("__NONE__", "branch-a"), false);
  assert.equal(isProductVisibleInBranch("branch-a, branch-b", "branch-b"), true);
  assert.equal(isProductVisibleInBranch("*", "new-branch"), true);
});

function createRouteHarness({
  status = "ACTIVE",
  stocks = [],
}: {
  status?: string;
  stocks?: Array<{ branchId: string; branchName: string; qty: number }>;
} = {}) {
  const handlers = new Map<string, (...args: any[]) => Promise<void>>();
  const emitted: Array<{ id: string }> = [];
  let currentStatus = status;
  let updateCount = 0;
  let rawQueryCount = 0;
  const product = {
    id: "product-1",
    name: "Test product",
    barcode: "123",
    category: "Aksesoris",
    brand: "Demo",
    visibleBranchIds: "branch-visible",
    status: "INACTIVE",
    stocks: [{ branchId: "branch-hidden", qty: 2, branch: { name: "Cabang Tersembunyi" } }],
  };
  const tx = {
    $queryRaw: async () => {
      rawQueryCount += 1;
      if (rawQueryCount === 1) {
        return currentStatus === null ? [] : [{ id: "product-1", status: currentStatus }];
      }
      return stocks;
    },
    product: {
      update: async ({ data }: { data: { status: string } }) => {
        updateCount += 1;
        currentStatus = data.status;
        return { id: "product-1" };
      },
    },
  };
  const prisma = {
    product: {
      findMany: async () => [product],
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      rawQueryCount = 0;
      return callback(tx);
    },
  } as unknown as PrismaClient;
  const app = {
    get: (path: string, ...routeHandlers: any[]) => handlers.set(`GET ${path}`, routeHandlers.at(-1)),
    post: (path: string, ...routeHandlers: any[]) => handlers.set(`POST ${path}`, routeHandlers.at(-1)),
  } as unknown as Application;
  const passThrough: RequestHandler = (_req, _res, next) => next();

  registerProductLifecycleRoutes(
    app,
    prisma,
    passThrough,
    () => passThrough,
    (event) => emitted.push(event),
  );

  return {
    handlers,
    emitted,
    get status() {
      return currentStatus;
    },
    get updateCount() {
      return updateCount;
    },
  };
}

function createResponse() {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return response;
}

test("inactive product endpoint returns branch stock and hidden status is not omitted", async () => {
  const harness = createRouteHarness();
  const response = createResponse();
  await harness.handlers.get("GET /api/products/inactive")?.({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body[0].status, "INACTIVE");
  assert.deepEqual(response.body[0].stocks, [
    { branchId: "branch-hidden", branchName: "Cabang Tersembunyi", qty: 2 },
  ]);
});

test("deactivation rejects remaining stock and leaves product active", async () => {
  const harness = createRouteHarness({
    stocks: [{ branchId: "branch-hidden", branchName: "Cabang Tersembunyi", qty: 2 }],
  });
  const response = createResponse();
  await harness.handlers.get("POST /api/products/:id/deactivate")?.(
    { params: { id: "product-1" } },
    response,
  );

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.stocks[0].branchName, "Cabang Tersembunyi");
  assert.equal(harness.status, "ACTIVE");
  assert.equal(harness.updateCount, 0);
});

test("zero-stock product can be deactivated and reactivated without changing its other fields", async () => {
  const harness = createRouteHarness({ stocks: [] });
  const deactivateResponse = createResponse();
  await harness.handlers.get("POST /api/products/:id/deactivate")?.(
    { params: { id: "product-1" } },
    deactivateResponse,
  );
  assert.equal(deactivateResponse.statusCode, 200);
  assert.equal(harness.status, "INACTIVE");

  const reactivateResponse = createResponse();
  await harness.handlers.get("POST /api/products/:id/reactivate")?.(
    { params: { id: "product-1" } },
    reactivateResponse,
  );
  assert.equal(reactivateResponse.statusCode, 200);
  assert.equal(harness.status, "ACTIVE");
  assert.equal(harness.updateCount, 2);
  assert.deepEqual(harness.emitted, [{ id: "product-1" }, { id: "product-1" }]);
});
