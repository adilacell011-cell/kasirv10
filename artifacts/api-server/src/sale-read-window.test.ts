import assert from "node:assert/strict";
import test from "node:test";
import { resolvePosSaleReadWindow } from "./sale-read-window";

test("active POS window uses persisted openTime and server time", () => {
  const window = resolvePosSaleReadWindow({
    shift: {
      status: "open",
      openTime: new Date("2026-11-07T09:00:00.000Z"),
      closeTime: null,
    },
    fallbackStart: "2026-11-07T08:00:00.000Z",
    serverNow: new Date("2026-11-07T10:00:00.000Z"),
  });

  assert.deepEqual(window, {
    start: new Date("2026-11-07T09:00:00.000Z"),
    end: new Date("2026-11-07T10:00:00.000Z"),
  });
});

test("closed POS window ends at the stored closeTime", () => {
  const window = resolvePosSaleReadWindow({
    shift: {
      status: "closed",
      openTime: "2026-11-07T09:00:00.000Z",
      closeTime: "2026-11-07T10:15:00.000Z",
    },
    serverNow: "2026-11-07T11:00:00.000Z",
  });

  assert.deepEqual(window, {
    start: new Date("2026-11-07T09:00:00.000Z"),
    end: new Date("2026-11-07T10:15:00.000Z"),
  });
});

test("no-shift POS view retains its date start but is capped by server time", () => {
  const window = resolvePosSaleReadWindow({
    fallbackStart: "2026-11-07T06:00:00.000Z",
    serverNow: "2026-11-07T10:00:00.000Z",
  });

  assert.deepEqual(window, {
    start: new Date("2026-11-07T06:00:00.000Z"),
    end: new Date("2026-11-07T10:00:00.000Z"),
  });
});

test("closed shifts without closeTime fail closed", () => {
  assert.equal(resolvePosSaleReadWindow({
    shift: {
      status: "closed",
      openTime: "2026-11-07T09:00:00.000Z",
      closeTime: null,
    },
    serverNow: "2026-11-07T10:00:00.000Z",
  }), null);
});

test("unknown shift status and future openTime fail closed", () => {
  assert.equal(resolvePosSaleReadWindow({
    shift: {
      status: "closing",
      openTime: "2026-11-07T09:00:00.000Z",
      closeTime: null,
    },
    serverNow: "2026-11-07T10:00:00.000Z",
  }), null);

  assert.equal(resolvePosSaleReadWindow({
    shift: {
      status: "open",
      openTime: "2026-11-07T11:00:00.000Z",
      closeTime: null,
    },
    serverNow: "2026-11-07T10:00:00.000Z",
  }), null);
});

test("future sales are beyond the resolved active POS end bound", () => {
  const window = resolvePosSaleReadWindow({
    shift: {
      status: "open",
      openTime: "2026-11-07T09:00:00.000Z",
      closeTime: null,
    },
    serverNow: "2026-11-07T10:00:00.000Z",
  });

  assert.ok(window);
  assert.ok(new Date("2026-11-07T10:00:03.000Z").getTime() > window.end.getTime());
});
