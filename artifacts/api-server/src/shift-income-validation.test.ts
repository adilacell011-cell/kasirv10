import assert from "node:assert/strict";
import test from "node:test";
import { validateReportedIncome } from "./shift-safety";

test("reported income is required and zero is valid", () => {
  for (const value of [undefined, null, "", "  "]) {
    assert.deepEqual(validateReportedIncome(value), { ok: false, reason: "missing" });
  }
  assert.deepEqual(validateReportedIncome(0), { ok: true, value: 0 });
  assert.deepEqual(validateReportedIncome("0"), { ok: true, value: 0 });
  assert.deepEqual(validateReportedIncome(12500), { ok: true, value: 12500 });
  assert.deepEqual(validateReportedIncome("12500"), { ok: true, value: 12500 });
});

test("reported income validation rejects invalid and negative values", () => {
  for (const value of [-1, "-1", Number.NaN, Number.POSITIVE_INFINITY, false, [], {}]) {
    assert.deepEqual(validateReportedIncome(value), { ok: false, reason: "invalid" });
  }
});
