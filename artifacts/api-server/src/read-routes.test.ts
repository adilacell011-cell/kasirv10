import assert from "node:assert/strict";
import test from "node:test";
import type { Express, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { registerBranchReadRoutes } from "./read-routes";

const branches = [
  { id: "branch-a", name: "Cabang A", address: "Alamat A", phone: "111" },
  { id: "branch-b", name: "Cabang B", address: "Alamat B", phone: "222" },
];

const products = [{
  id: "product-1",
  status: "ACTIVE",
  name: "Produk Uji",
  sellingPrice: 1000,
  discountPrice: 0,
  commissionAmount: 10,
  buyingPrice: 600,
  stocks: [
    { branchId: "branch-a", qty: 7 },
    { branchId: "branch-b", qty: 19 },
  ],
}];

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

function setup() {
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
        return query.where
          ? summaries.filter((summary) => summary.branchId === query.where.branchId)
          : summaries;
      },
    },
    sale: {
      findMany: async (query: any) => {
        queries.sales.push(query);
        return query.where.branchId
          ? liveSales.filter((sale) => sale.branchId === query.where.branchId)
          : liveSales;
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

    const productResult = await request("/api/products", cashier);
    assert.deepEqual(Object.keys(productResult.body[0].stocks), [branchId]);
    assert.equal(productResult.body[0].stocks[branchId], branchId === "branch-a" ? 7 : 19);
    assert.equal("buyingPrice" in productResult.body[0], false);
    assert.equal("purchasePrice" in productResult.body[0], false);

    const usersResult = await request("/api/users", cashier);
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
  assert.deepEqual(Object.keys((await request("/api/products", cashier)).body[0].stocks), []);
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
});
