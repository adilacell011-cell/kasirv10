import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSaleReadQuery,
  buildSalePageWhere,
  finishSalePage,
  parseSalePageInput,
  SALE_READ_PAGE_SIZE,
} from "./sale-pagination.js";

test("sale page size is bounded and malformed limits are rejected", () => {
  assert.deepEqual(parseSalePageInput(undefined, undefined), {
    ok: true,
    limit: SALE_READ_PAGE_SIZE,
  });
  assert.equal(parseSalePageInput("1", undefined).ok, true);
  assert.equal(parseSalePageInput(String(SALE_READ_PAGE_SIZE), undefined).ok, true);
  assert.equal(parseSalePageInput(String(SALE_READ_PAGE_SIZE + 1), undefined).ok, false);
  assert.equal(parseSalePageInput("0", undefined).ok, false);
  assert.equal(parseSalePageInput("10.5", undefined).ok, false);
});

test("keyset cursor orders by createdAt and id without requiring the cursor row to remain", () => {
  const parsed = parseSalePageInput("2", Buffer.from(JSON.stringify({
    id: "sale-2",
    createdAt: "2026-11-05T10:00:00.000Z",
  })).toString("base64url"));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const where = buildSalePageWhere({ branchId: "branch-a" }, parsed.cursor);
  assert.deepEqual(where, {
    AND: [
      { branchId: "branch-a" },
      {
        OR: [
          { createdAt: { lt: new Date("2026-11-05T10:00:00.000Z") } },
          { createdAt: new Date("2026-11-05T10:00:00.000Z"), id: { lt: "sale-2" } },
        ],
      },
    ],
  });
});

test("sale query selects only used fields and never loads more than one bounded page at once", () => {
  const input = parseSalePageInput(undefined, undefined);
  assert.equal(input.ok, true);
  if (!input.ok) return;
  const query = buildSaleReadQuery({ branchId: "branch-a" }, input);
  assert.equal(query.take, SALE_READ_PAGE_SIZE + 1);
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(query.select.cashier.select.name, true);
  assert.equal("password" in query.select.cashier.select, false);
  assert.equal(query.select.items.select.product.select.name, true);
  assert.equal("description" in query.select.items.select.product.select, false);
});

test("invalid cursors are rejected and a next cursor points to the last returned row", () => {
  assert.equal(parseSalePageInput("2", "not-a-cursor").ok, false);
  const page = finishSalePage([
    { id: "sale-3", createdAt: new Date("2026-11-05T11:00:00.000Z") },
    { id: "sale-2", createdAt: new Date("2026-11-05T10:00:00.000Z") },
    { id: "sale-1", createdAt: new Date("2026-11-05T09:00:00.000Z") },
  ], 2);
  assert.deepEqual(page.items.map((sale) => sale.id), ["sale-3", "sale-2"]);
  assert.ok(page.nextCursor);
  const decoded = JSON.parse(Buffer.from(page.nextCursor!, "base64url").toString("utf8"));
  assert.deepEqual(decoded, { id: "sale-2", createdAt: "2026-11-05T10:00:00.000Z" });
  assert.equal(finishSalePage(page.items, 2).nextCursor, null);
});

test("paging a large report set preserves row order and existing financial reductions", () => {
  const source = Array.from({ length: 2_500 }, (_, index) => ({
    id: `sale-${String(2_500 - index).padStart(5, "0")}`,
    createdAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000),
    status: index % 17 === 0 ? "refunded" : "success",
    total: (index % 97) * 100,
    totalCommission: (index % 11) * 10,
  })).sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

  let cursorValue: string | undefined;
  const received: typeof source = [];
  let pageCount = 0;
  do {
    const input = parseSalePageInput("100", cursorValue);
    assert.equal(input.ok, true);
    if (!input.ok) return;
    const query = buildSaleReadQuery({}, input);
    assert.equal(query.take, 101);
    const eligible = input.cursor
      ? source.filter((sale) =>
          sale.createdAt < input.cursor!.createdAt ||
          (sale.createdAt.getTime() === input.cursor!.createdAt.getTime() && sale.id < input.cursor!.id))
      : source;
    const page = finishSalePage(eligible.slice(0, query.take), input.limit);
    received.push(...page.items);
    cursorValue = page.nextCursor ?? undefined;
    pageCount++;
  } while (cursorValue);

  assert.equal(pageCount, 25);
  assert.deepEqual(received.map((sale) => sale.id), source.map((sale) => sale.id));
  const originalTotals = source.filter((sale) => sale.status !== "refunded").reduce((totals, sale) => ({
    revenue: totals.revenue + sale.total,
    commission: totals.commission + sale.totalCommission,
  }), { revenue: 0, commission: 0 });
  const pagedTotals = received.filter((sale) => sale.status !== "refunded").reduce((totals, sale) => ({
    revenue: totals.revenue + sale.total,
    commission: totals.commission + sale.totalCommission,
  }), { revenue: 0, commission: 0 });
  assert.deepEqual(pagedTotals, originalTotals);
});
