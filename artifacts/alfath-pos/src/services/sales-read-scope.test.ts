import assert from "node:assert/strict";
import test from "node:test";
import {
  isRevenueEligibleSaleStatus,
  makeSalesReadQueries,
  makeSalesReadWindows,
} from "./sales-read-scope";

test("POS reads begin at the active shift start when the shift is open", () => {
  const now = new Date("2026-11-05T17:00:00.000Z");
  const start = "2026-11-05T06:40:00.000Z";
  const [window] = makeSalesReadWindows({
    view: "pos",
    shiftOpen: true,
    shiftStartTime: start,
    now,
  });
  assert.equal(window.start.toISOString(), start);
  assert.equal(window.end.toISOString(), now.toISOString());
});

test("POS reads delegate the upper bound to the server, not the client clock", () => {
  const now = new Date("2026-11-05T17:00:00.000Z");
  const start = "2026-11-05T06:40:00.000Z";
  const [query] = makeSalesReadQueries(
    { view: "pos", shiftOpen: true, shiftId: "shift-1", shiftStartTime: start, now },
    { branchId: "branch-1" },
  );

  assert.equal(query.branchId, "branch-1");
  assert.equal(query.startDate, start);
  assert.equal(query.scope, "pos");
  assert.equal(query.posShiftOpen, "true");
  assert.equal(query.shiftId, "shift-1");
  assert.equal(query.endDate, undefined);
});

test("POS without an active shift still requests a server-bounded day read", () => {
  const [query] = makeSalesReadQueries({
    view: "pos",
    shiftOpen: false,
    shiftStartTime: null,
    now: new Date("2026-11-05T17:00:00.000Z"),
  });

  assert.equal(query.scope, "pos");
  assert.equal(query.posShiftOpen, "false");
  assert.equal(query.shiftId, undefined);
  assert.equal(query.endDate, undefined);
});

test("only successful transactions qualify for revenue aggregates", () => {
  assert.equal(isRevenueEligibleSaleStatus("success"), true);
  assert.equal(isRevenueEligibleSaleStatus("refunded"), false);
  assert.equal(isRevenueEligibleSaleStatus("cancelled"), false);
  assert.equal(isRevenueEligibleSaleStatus("unknown"), false);
  assert.equal(isRevenueEligibleSaleStatus(null), false);
});

test("report reads retain their explicit end-date boundary", () => {
  const now = new Date("2026-11-05T17:00:00.000Z");
  const [query] = makeSalesReadQueries({ view: "reports", now });

  assert.equal(query.endDate, now.toISOString());
});

test("POS falls back to the logical-day boundary when no valid active shift exists", () => {
  const beforeSix = new Date(2026, 10, 5, 5, 30, 0);
  const [window] = makeSalesReadWindows({ view: "pos", now: beforeSix });
  const expected = new Date(2026, 10, 4, 6, 0, 0);
  assert.equal(window.start.getTime(), expected.getTime());
});

test("default report range keeps the existing three-day lookback and current/yesterday cards", () => {
  const now = new Date(2026, 10, 5, 12, 0, 0);
  const [window] = makeSalesReadWindows({ view: "reports", now });
  const expectedStart = new Date(2026, 10, 2, 6, 0, 0);
  assert.equal(window.start.getTime(), expectedStart.getTime());
  assert.equal(window.end.getTime(), now.getTime());
});

test("a historical custom report range also fetches the current and previous day cards", () => {
  const now = new Date(2026, 10, 5, 12, 0, 0);
  const windows = makeSalesReadWindows({
    view: "reports",
    reportStartDate: "2026-01-02",
    reportEndDate: "2026-01-03",
    now,
  });
  assert.equal(windows.length, 2);
  assert.equal(windows[0].start.getTime(), new Date(2026, 0, 2, 6, 0, 0).getTime());
  assert.equal(windows[0].end.getTime(), new Date(2026, 0, 4, 5, 59, 59, 999).getTime());
  assert.equal(windows[1].start.getTime(), new Date(2026, 10, 4, 6, 0, 0).getTime());
  assert.equal(windows[1].end.getTime(), now.getTime());
});

test("overlapping custom report ranges do not fetch overlapping rows twice", () => {
  const now = new Date(2026, 10, 5, 12, 0, 0);
  const windows = makeSalesReadWindows({
    view: "reports",
    reportStartDate: "2026-11-04",
    reportEndDate: "2026-11-05",
    now,
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].start.getTime(), new Date(2026, 10, 4, 6, 0, 0).getTime());
  assert.equal(windows[0].end.getTime(), new Date(2026, 10, 6, 5, 59, 59, 999).getTime());
});
