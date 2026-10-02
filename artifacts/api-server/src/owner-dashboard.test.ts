import assert from "node:assert/strict";
import test from "node:test";
import type { Express, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { registerOwnerDashboardRoutes } from "./owner-dashboard";

const today = "2026-10-02";
const stored = [
  { id: "a-old", branchId: "a", date: "2026-09-30", revenue: 1000, totalProfit: 100, totalCommission: 10, salesCount: 2 },
  { id: "b-old", branchId: "b", date: "2026-09-30", revenue: 2000, totalProfit: 200, totalCommission: 20, salesCount: 3 },
  { id: "a-today", branchId: "a", date: today, revenue: 900, totalProfit: 90, totalCommission: 9, salesCount: 1 },
  { id: "b-today", branchId: "b", date: today, revenue: 800, totalProfit: 80, totalCommission: 8, salesCount: 1 },
];
const live = [
  { branchId: "a", _sum: { total: 1500, totalProfit: 150, totalCommission: 15 }, _count: { _all: 2 } },
  { branchId: "b", _sum: { total: 2500, totalProfit: 250, totalCommission: 25 }, _count: { _all: 4 } },
];

function setup(overrides: any = {}) {
  const routes = new Map<string, RequestHandler[]>();
  const queries: { kind: string; query: any }[] = [];
  const prisma = {
    dailyIncomeSummary: { findMany: async (query: any) => {
      queries.push({ kind: "history", query });
      return stored.filter((row) => !query.where.branchId || row.branchId === query.where.branchId);
    } },
    sale: {
      groupBy: async (query: any) => {
        queries.push({ kind: "live", query });
        return live.filter((row) => !query.where.branchId || row.branchId === query.where.branchId);
      },
      findMany: async (query: any) => { queries.push({ kind: "recent", query }); return []; },
    },
    saleItem: { groupBy: async (query: any) => { queries.push({ kind: "ranked", query }); return []; } },
    product: { findMany: async () => [] },
    shift: { findMany: async () => [] },
    ...overrides,
  };
  const auth: RequestHandler = (_req, _res, next) => next();
  const owner: RequestHandler = (_req, _res, next) => next();
  const app = { get: (path: string, ...handlers: RequestHandler[]) => routes.set(path, handlers) };
  registerOwnerDashboardRoutes(app as unknown as Express, prisma as unknown as PrismaClient, auth, owner, () => today);
  const request = async (path: string, branchId?: string) => {
    let body: any;
    let failure: unknown;
    const handlers = routes.get(path)!;
    assert.equal(handlers[0], auth);
    assert.equal(handlers[1], owner);
    await handlers[2](
      { query: branchId === undefined ? {} : { branchId } } as any,
      { json: (value: any) => { body = value; } } as any,
      (error?: unknown) => { failure = error; },
    );
    return { body, failure };
  };
  return { request, queries };
}

test("all branches: live replaces stored totals without double counting; history survives", async () => {
  const { request, queries } = setup();
  const { body, failure } = await request("/api/owner-dashboard");
  assert.equal(failure, undefined);
  assert.equal(body.summaries.length, 4);
  assert.equal(body.summaries.reduce((sum: number, row: any) => sum + row.revenue, 0), 7000);
  assert.equal(body.summaries.reduce((sum: number, row: any) => sum + row.count, 0), 11);
  assert.equal(body.summaries.find((row: any) => row.id === "a-old").revenue, 1000);
  assert.equal(queries.some((row) => row.kind === "recent"), false);
  const query = queries.find((row) => row.kind === "live")!.query;
  assert.equal(query.where.status, "success");
  assert.equal(query.where.createdAt.gte.toISOString(), "2026-10-01T23:00:00.000Z");
  assert.equal(query.where.createdAt.lt.toISOString(), "2026-10-02T23:00:00.000Z");
  assert.deepEqual(query.by, ["branchId"]);
  assert.deepEqual(query._sum, { total: true, totalProfit: true, totalCommission: true });
});

test("selected branch is filtered in both historical and live database queries", async () => {
  const { request, queries } = setup();
  const { body } = await request("/api/owner-dashboard", "b");
  assert.equal(body.summaries.length, 2);
  assert.ok(body.summaries.every((row: any) => row.branchId === "b"));
  assert.equal(body.summaries.reduce((sum: number, row: any) => sum + row.revenue, 0), 4500);
  for (const { query } of queries) assert.equal(query.where.branchId, "b");
});

test("missing branch returns empty, not global totals", async () => {
  const { request } = setup();
  const { body } = await request("/api/owner-dashboard", "missing");
  assert.deepEqual(body.summaries, []);
});

test("no current live sales preserves today's stored row, matching the existing endpoint", async () => {
  const { request } = setup({ sale: { groupBy: async () => [] } });
  const { body } = await request("/api/owner-dashboard");
  assert.equal(body.summaries.find((row: any) => row.id === "a-today").revenue, 900);
});

test("database failures are forwarded, never turned into zero income", async () => {
  const error = new Error("Database unavailable");
  const { request } = setup({ sale: { groupBy: async () => { throw error; } } });
  const result = await request("/api/owner-dashboard");
  assert.equal(result.failure, error);
  assert.equal(result.body, undefined);
});

test("supporting dashboard lists are bounded and scoped without returning the full sales log", async () => {
  const { request, queries } = setup();
  const { body } = await request("/api/owner-dashboard/details", "a");
  assert.deepEqual(body, { recentSales: [], topProducts: [] });
  const recent = queries.find((row) => row.kind === "recent")!.query;
  const ranked = queries.find((row) => row.kind === "ranked")!.query;
  assert.equal(recent.take, 10);
  assert.equal(recent.where.branchId, "a");
  assert.deepEqual(recent.include.cashier, { select: { id: true, name: true } });
  assert.equal(ranked.take, 5);
  assert.equal(ranked.where.sale.branchId, "a");
  assert.deepEqual(ranked.where.sale.status, { not: "refunded" });
});