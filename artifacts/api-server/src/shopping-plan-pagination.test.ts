import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeShoppingPlanCursor,
  encodeShoppingPlanCursor,
  SHOPPING_PLAN_PAGE_SIZE,
} from "./shopping-plan-pagination";

test("purchase history page size is bounded", () => {
  assert.equal(SHOPPING_PLAN_PAGE_SIZE, 20);
});

test("purchase history cursor round-trips a stable date and ID", () => {
  const expected = { id: "plan-123", createdAt: new Date("2026-11-24T03:00:00.000Z") };
  assert.deepEqual(decodeShoppingPlanCursor(encodeShoppingPlanCursor(expected)), expected);
});

test("missing purchase history cursor starts at the newest page", () => {
  assert.equal(decodeShoppingPlanCursor(undefined), null);
});

test("malformed and oversized purchase history cursors are rejected", () => {
  for (const value of ["", "%%%", "e30", "a".repeat(513), 42, null]) {
    assert.throws(() => decodeShoppingPlanCursor(value), /Invalid shopping plan cursor/);
  }
});
