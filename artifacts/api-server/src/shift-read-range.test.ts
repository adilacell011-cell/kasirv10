import assert from "node:assert/strict";
import test from "node:test";
import { parseShiftReadRange } from "./shift-read-range";

test("no shift date range preserves the existing unfiltered report query", () => {
  assert.deepEqual(parseShiftReadRange(undefined, undefined), { ok: true, where: {} });
});

test("valid logical date bounds are pushed into the query", () => {
  assert.deepEqual(
    parseShiftReadRange("2026-11-01", "2026-11-30"),
    { ok: true, where: { shiftDate: { gte: "2026-11-01", lte: "2026-11-30" } } },
  );
});

test("one-sided valid bounds are supported", () => {
  assert.deepEqual(
    parseShiftReadRange("2026-11-01", undefined),
    { ok: true, where: { shiftDate: { gte: "2026-11-01" } } },
  );
  assert.deepEqual(
    parseShiftReadRange(undefined, "2026-11-30"),
    { ok: true, where: { shiftDate: { lte: "2026-11-30" } } },
  );
});

test("malformed or impossible dates and reversed ranges are rejected", () => {
  assert.deepEqual(parseShiftReadRange("2026-2-01", "2026-11-30"), { ok: false });
  assert.deepEqual(parseShiftReadRange("2026-02-30", undefined), { ok: false });
  assert.deepEqual(parseShiftReadRange("2026-11-30", "2026-11-01"), { ok: false });
  assert.deepEqual(parseShiftReadRange(["2026-11-01"], undefined), { ok: false });
});
