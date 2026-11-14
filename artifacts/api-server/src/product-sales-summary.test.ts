import assert from "node:assert/strict";
import test from "node:test";
import type { Express, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  buildProductSalesSummaryLines,
  getProductSalesSummaryWindowStart,
  registerProductSalesSummaryRoutes,
} from "./product-sales-summary";

test("product-demand window uses 30 inclusive WIB business dates", () => {
  assert.equal(getProductSalesSummaryWindowStart(new Date("2026-11-14T22:00:00.000Z")), "2026-10-16");
  assert.equal(getProductSalesSummaryWindowStart(new Date("2026-11-14T22:59:00.000Z")), "2026-10-16");
  assert.equal(getProductSalesSummaryWindowStart(new Date("2026-11-14T23:00:00.000Z")), "2026-10-17");
  assert.equal(getProductSalesSummaryWindowStart(new Date("2026-11-14T22:00:00.000Z"), 1), "2026-11-14");
  assert.throws(() => getProductSalesSummaryWindowStart(new Date(), 31), /1–30 hari/);
});

test("summary lines combine duplicate SKU rows and sort consistently", () => {
  assert.deepEqual(
    buildProductSalesSummaryLines([
      { productId: "voucher-b", qty: 2 },
      { productId: "voucher-a", qty: 3 },
      { productId: "voucher-b", qty: 4 },
    ]),
    [
      { productId: "voucher-a", qty: 3 },
      { productId: "voucher-b", qty: 6 },
    ],
  );
});

test("summary lines reject invalid quantities and missing product IDs", () => {
  assert.throws(() => buildProductSalesSummaryLines([{ productId: "x", qty: 0 }]), /tidak valid/);
  assert.throws(() => buildProductSalesSummaryLines([{ productId: " ", qty: 1 }]), /tidak valid/);
  assert.throws(() => buildProductSalesSummaryLines([{ productId: "x", qty: 1.5 }]), /tidak valid/);
});

test("product-demand endpoint is mounted behind authentication and the Owner role", () => {
  const routes: Array<{ path: string; handlers: RequestHandler[] }> = [];
  const roleChecks: string[][] = [];
  const authenticate = (() => undefined) as RequestHandler;
  const roleGuard = (() => undefined) as RequestHandler;
  const app = {
    get: (path: string, ...handlers: RequestHandler[]) => routes.push({ path, handlers }),
  } as unknown as Express;

  registerProductSalesSummaryRoutes(
    app,
    {} as PrismaClient,
    authenticate,
    (...roles) => {
      roleChecks.push(roles);
      return roleGuard;
    },
  );

  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, "/api/product-sales-summary");
  assert.equal(routes[0].handlers[0], authenticate);
  assert.equal(routes[0].handlers[1], roleGuard);
  assert.deepEqual(roleChecks, [["ADMIN"]]);
});

test("product-demand endpoint bounds filters and pages by branch and product", async () => {
  const routes: Array<{ path: string; handlers: RequestHandler[] }> = [];
  const calls: Array<Record<string, any>> = [];
  let results = [
    { branchId: "branch-a", productId: "product-a", saleDate: "2026-11-12", qty: 3 },
    { branchId: "branch-a", productId: "product-b", saleDate: "2026-11-13", qty: 2 },
  ];
  const app = {
    get: (path: string, ...handlers: RequestHandler[]) => routes.push({ path, handlers }),
  } as unknown as Express;
  const prisma = {
    dailyProductSalesSummary: {
      findMany: async (args: Record<string, any>) => {
        calls.push(args);
        return results;
      },
    },
  } as unknown as PrismaClient;
  registerProductSalesSummaryRoutes(app, prisma, (() => undefined) as RequestHandler, () => (() => undefined) as RequestHandler);
  const handler = routes[0].handlers.at(-1) as unknown as (
    req: { query: Record<string, unknown> },
    res: { statusCode: number; body?: any; status(code: number): any; json(body: any): any },
  ) => Promise<void>;
  const response = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  });

  const firstPage = response();
  await handler({ query: { days: "7", limit: "1", branchId: "branch-a" } }, firstPage);
  assert.equal(firstPage.statusCode, 200);
  assert.equal(firstPage.body.items.length, 1);
  assert.equal(firstPage.body.hasMore, true);
  assert.equal(calls[0].where.branchId, "branch-a");
  assert.equal(calls[0].take, 2);

  results = [{ branchId: "branch-a", productId: "product-b", saleDate: "2026-11-13", qty: 2 }];
  const secondPage = response();
  await handler({
    query: { days: "7", limit: "1", branchId: "branch-a", cursor: firstPage.body.nextCursor },
  }, secondPage);
  assert.equal(secondPage.statusCode, 200);
  assert.equal(secondPage.body.hasMore, false);
  assert.ok(calls[1].where.OR, "the next page must use a keyset cursor");

  const invalidPage = response();
  const callCount = calls.length;
  await handler({ query: { days: "31" } }, invalidPage);
  assert.equal(invalidPage.statusCode, 400);
  assert.equal(calls.length, callCount, "invalid windows must not query the database");
});
