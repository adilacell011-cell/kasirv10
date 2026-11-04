import assert from "node:assert/strict";
import test from "node:test";
import {
  hashIdempotencyScope,
  hashSaleRequest,
  idempotencyPayloadMatches,
  createSaleIdempotencySnapshot,
  parseSaleIdempotencySnapshot,
  archivedSaleReplay,
} from "./idempotency";

test("idempotency scope separates accounts and branches", () => {
  const key = "qa-key-123456";
  const base = hashIdempotencyScope({ accountId: "user-a", branchId: "branch-a", key });
  assert.equal(base, hashIdempotencyScope({ accountId: "user-a", branchId: "branch-a", key }));
  assert.notEqual(base, hashIdempotencyScope({ accountId: "user-b", branchId: "branch-a", key }));
  assert.notEqual(base, hashIdempotencyScope({ accountId: "user-a", branchId: "branch-b", key }));
});

test("idempotency binds a key to the original request payload", () => {
  const fingerprint = hashSaleRequest({ items: [{ productId: "p1", qty: 1 }], total: 100 });
  assert.equal(
    idempotencyPayloadMatches(fingerprint, hashSaleRequest({ items: [{ productId: "p1", qty: 1 }], total: 100 })),
    true,
  );
  assert.equal(
    idempotencyPayloadMatches(fingerprint, hashSaleRequest({ items: [{ productId: "p1", qty: 2 }], total: 200 })),
    false,
  );
});

test("archived replay snapshot preserves only the server-calculated summary", () => {
  const snapshot = createSaleIdempotencySnapshot({
    id: "sale-1",
    branchId: "branch-1",
    cashierId: "cashier-1",
    total: 15000,
    totalCommission: 1000,
    totalProfit: 4000,
    status: "success",
    createdAt: new Date("2026-11-01T01:00:00.000Z"),
  });
  assert.deepEqual(parseSaleIdempotencySnapshot(snapshot), snapshot);
  assert.equal("items" in snapshot, false);
  assert.deepEqual(archivedSaleReplay(snapshot), {
    ...snapshot,
    createdAt: new Date("2026-11-01T01:00:00.000Z"),
    items: [],
    archived: true,
    replay: true,
  });
  assert.equal(parseSaleIdempotencySnapshot({ ...snapshot, total: "15000" }), null);
});
