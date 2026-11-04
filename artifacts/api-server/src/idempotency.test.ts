import assert from "node:assert/strict";
import test from "node:test";
import {
  hashIdempotencyScope,
  hashSaleRequest,
  idempotencyPayloadMatches,
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
