import assert from "node:assert/strict";
import test from "node:test";
import type { Express, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { registerBranchReadRoutes } from "./read-routes";

const branches = [
  { id: "branch-a", name: "Cabang A", address: "Alamat A", phone: "111" },
  { id: "branch-b", name: "Cabang B", address: "Alamat B", phone: "222" },
];

const commonProduct = {
  id: "product-1",
  status: "ACTIVE",
  name: "Produk Uji",
  sellingPrice: 1000,
  discountPrice: 0,
  commissionAmount: 10,
  buyingPrice: 600,
  visibleBranchIds: "*",
  stocks: [
    { branchId: "branch-a", qty: 7 },
    { branchId: "branch-b", qty: 19 },
  ],
};
const products = [
  commonProduct,
  { ...commonProduct, id: "only-a", visibleBranchIds: "branch-a" },
  { ...commonProduct, id: "only-b", visibleBranchIds: "branch-b" },
  { ...commonProduct, id: "shared", visibleBranchIds: "branch-a, branch-b" },
];

const users = [
  { id: "admin", username: "owner", name: "Owner", role: "ADMIN", branchId: null, password: "hash-owner", branch: null },
  { id: "cashier-a", username: "cashier-a", name: "Kasir A", role: "CASHIER", branchId: "branch-a", password: "hash-a", branch: branches[0] },
  { id: "cashier-b", username: "cashier-b", name: "Kasir B", role: "CASHIER", branchId: "branch-b", password: "hash-b", branch: branches[1] },
];

const summaries = [
  { id: "history-a", branchId: "branch-a", date: "2026-10-30", revenue: 100, totalProfit: 10, totalCommission: 3, salesCount: 1 },
  { id: "history-b", branchId: "branch-b", date: "2026-10-30", revenue: 900, totalProfit: 90, totalCommission: 30, salesCount: 9 },
];

const liveSales = [
  { id: "sale-a", branchId: "branch-a", status: "success", total: 200, totalProfit: 20, totalCommission: 4, createdAt: new Date() },
  { id: "sale-b", branchId: "branch-b", status: "success", total: 800, totalProfit: 80, totalCommission: 16, createdAt: new Date() },
];

function setup(fixtureSummaries = summaries, fixtureSales = liveSales) {
  const routes = new Map<string, RequestHandler[]>();
  const queries: Record<string, any[]> = {
    products: [],
    branches: [],
    users: [],
    summaries: [],
    sales: [],
  };
  const prisma = {
    product: {
      findMany: async (query: any) => {
        queries.products.push(query);
        return products.map((product) => ({
          ...product,
          stocks: query.include.stocks === true
            ? product.stocks
            : product.stocks.filter((stock) => stock.branchId === query.include.stocks.where.branchId),
        }));
      },
    },
    branch: {
      findMany: async (query: any) => {
        queries.branches.push(query);
        return query.where
          ? branches.filter((branch) => branch.id === query.where.id)
          : branches;
      },
    },
    user: {
      findMany: async (query: any) => {
        queries.users.push(query);
        return query.where
          ? users.filter((user) => user.branchId === query.where.branchId)
          : users;
      },
    },
    dailyIncomeSummary: {
      findMany: async (query: any) => {
        queries.summaries.push(query);
        return query.where && Object.hasOwn(query.where, "branchId")
          ? fixtureSummaries.filter((summary) => summary.branchId === query.where.branchId)
          : fixtureSummaries;
      },
    },
    sale: {
      findMany: async (query: any) => {
        queries.sales.push(query);
        return Object.hasOwn(query.where, "branchId")
          ? fixtureSales.filter((sale) => sale.branchId === query.where.branchId)
          : fixtureSales;
      },
    },
  };
  const authenticate: RequestHandler = (_req, _res, next) => next();
  const app = {
    get: (path: string, ...handlers: RequestHandler[]) => routes.set(path, handlers),
  };
  registerBranchReadRoutes(
    app as unknown as Express,
    prisma as unknown as PrismaClient,
    authenticate,
    () => "2026-11-02",
  );

  const request = async (
    path: string,
    user: { role: string; branchId?: string | null },
    query: Record<string, unknown> = {},
  ) => {
    const handlers = routes.get(path);
    assert.ok(handlers, `route registered: ${path}`);
    assert.equal(handlers![0], authenticate, "route uses verified-token authentication");
    let body: any;
    let status = 200;
    await handlers![1](
      { user, query } as any,
      {
        json: (value: any) => { body = value; },
        status: (value: number) => {
          status = value;
          return { json: (value: any) => { body = value; } };
        },
      } as any,
      (error?: unknown) => {
        if (error) throw error;
      },
    );
    return { status, body };
  };

  return { request, queries };
}

for (const [branchId, otherBranchId] of [
  ["branch-a", "branch-b"],
  ["branch-b", "branch-a"],
] as const) {
  test(`cashier ${branchId} sees only their own branch on all four read endpoints`, async () => {
    const { request } = setup();
    const cashier = { role: "CASHIER", branchId };

    const branchResult = await request("/api/branches", cashier, { branchId: otherBranchId });
    assert.deepEqual(branchResult.body.map((row: any) => row.id), [branchId]);

    const productResult = await request("/api/products", cashier, { branchId: otherBranchId, role: "ADMIN" });
    assert.deepEqual(productResult.body.map((row: any) => row.id), [
      "product-1", branchId === "branch-a" ? "only-a" : "only-b", "shared",
    ]);
    assert.ok(productResult.body.every((row: any) =>
      Object.keys(row.stocks).every((stockBranchId) => stockBranchId === branchId)));
    assert.equal(productResult.body.find((row: any) => row.id === "shared").visibleBranchIds, branchId);
    assert.deepEqual(Object.keys(productResult.body[0].stocks), [branchId]);
    assert.equal(productResult.body[0].stocks[branchId], branchId === "branch-a" ? 7 : 19);
    assert.equal("buyingPrice" in productResult.body[0], false);
    assert.equal("purchasePrice" in productResult.body[0], false);

    const usersResult = await request("/api/users", cashier, { branchId: otherBranchId, role: "ADMIN" });
    assert.deepEqual(usersResult.body.map((row: any) => row.branchId), [branchId]);
    assert.ok(usersResult.body.every((row: any) => !("password" in row)));

    const summariesResult = await request("/api/daily-summaries", cashier, { branchId: otherBranchId });
    assert.ok(summariesResult.body.length > 0);
    assert.ok(summariesResult.body.every((row: any) => row.branchId === branchId));
  });
}

test("admin retains all-branch access and product cost fields", async () => {
  const { request } = setup();
  const admin = { role: "ADMIN", branchId: null };

  const branchesResult = await request("/api/branches", admin);
  assert.deepEqual(branchesResult.body.map((row: any) => row.id), ["branch-a", "branch-b"]);

  const productsResult = await request("/api/products", admin);
  assert.equal(productsResult.body.length, 4);
  assert.deepEqual(Object.keys(productsResult.body[0].stocks).sort(), ["branch-a", "branch-b"]);
  assert.equal(productsResult.body[0].buyingPrice, 600);
  assert.equal(productsResult.body[0].purchasePrice, 600);

  const usersResult = await request("/api/users", admin);
  assert.deepEqual(usersResult.body.map((row: any) => row.branchId), [null, "branch-a", "branch-b"]);
  assert.ok(usersResult.body.every((row: any) => !("password" in row)));

  const summariesResult = await request("/api/daily-summaries", admin);
  assert.deepEqual([...new Set(summariesResult.body.map((row: any) => row.branchId))].sort(), ["branch-a", "branch-b"]);
});

test("a cashier without a branch claim receives no branch data", async () => {
  const { request } = setup();
  const cashier = { role: "CASHIER", branchId: null };

  assert.deepEqual((await request("/api/branches", cashier)).body, []);
  assert.deepEqual((await request("/api/products", cashier)).body, []);
  assert.deepEqual((await request("/api/users", cashier)).body, []);
  assert.deepEqual((await request("/api/daily-summaries", cashier)).body, []);
});

test("daily-summary queries use the token branch, not a supplied branchId", async () => {
  const { request, queries } = setup();
  await request("/api/daily-summaries", { role: "CASHIER", branchId: "branch-a" }, { branchId: "branch-b" });

  assert.equal(queries.summaries[0].where.branchId, "branch-a");
  assert.equal(queries.sales[0].where.branchId, "branch-a");
});

test("admin daily summaries remain global and preserve history/live aggregation", async () => {
  const { request, queries } = setup();
  const result = await request("/api/daily-summaries", { role: "ADMIN" });

  assert.equal(result.body.length, 4);
  assert.equal(result.body.reduce((total: number, row: any) => total + row.revenue, 0), 2000);
  assert.deepEqual(queries.summaries[0].where, {});
  assert.equal("branchId" in queries.sales[0].where, false);
  assert.equal(queries.sales[0].where.createdAt.gte.toISOString(), "2026-11-01T23:00:00.000Z");
  assert.equal(queries.sales[0].where.createdAt.lt.toISOString(), "2026-11-02T23:00:00.000Z");
  assert.equal(queries.sales[0].where.status, "success");
});

test("today's live summary replaces the stored row without double counting", async () => {
  const { request } = setup([
    ...summaries,
    { ...summaries[0], id: "a-stored-today", date: "2026-11-02", revenue: 999 },
    { ...summaries[1], id: "b-stored-today", date: "2026-11-02", revenue: 999 },
  ]);
  const { body } = await request("/api/daily-summaries", { role: "ADMIN" });
  assert.equal(body.length, 4);
  assert.equal(body.find((row: any) => row.branchId === "branch-a" && row.date === "2026-11-02").revenue, 200);
  assert.equal(body.find((row: any) => row.branchId === "branch-b" && row.date === "2026-11-02").revenue, 800);
});

test("stored summary survives when no live sales exist", async () => {
  const { request } = setup([
    { ...summaries[0], date: "2026-11-02" },
    { ...summaries[1], date: "2026-11-02" },
  ], []);
  const { body } = await request("/api/daily-summaries", { role: "CASHIER", branchId: "branch-b" });
  assert.equal(body.length, 1);
  assert.equal(body[0].revenue, 900);
  assert.equal(body[0].profit, 90);
  assert.equal(body[0].totalCommission, 30);
  assert.equal(body[0].count, 9);
});

test("array/object branchId query manipulation never overrides cashier claims", async () => {
  const { request } = setup();
  for (const branchId of [["branch-b"], { not: "branch-a" }, "", "*"]) {
    for (const path of ["/api/products", "/api/branches", "/api/users", "/api/daily-summaries"]) {
      const { body, status } = await request(path, { role: "CASHIER", branchId: "branch-a" }, { branchId });
      assert.equal(status, 200);
      if (path === "/api/products") assert.ok(body.every((row: any) => !("branch-b" in row.stocks) && row.id !== "only-b"));
      else if (path === "/api/branches") assert.deepEqual(body.map((row: any) => row.id), ["branch-a"]);
      else assert.ok(body.every((row: any) => row.branchId === "branch-a"));
    }
  }
});

test("AUDIT retains its pre-existing cross-branch read and cost-price access", async () => {
  const { request } = setup();
  assert.equal((await request("/api/branches", { role: "AUDIT" })).body.length, 2);
  assert.equal((await request("/api/products", { role: "AUDIT" })).body[0].buyingPrice, 600);
});
