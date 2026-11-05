import assert from "node:assert/strict";
import test from "node:test";
import { formatApiMemorySample, startApiMemoryDiagnostics } from "./memory-diagnostics";

const sample = {
  rss: 20 * 1024 * 1024,
  heapTotal: 10 * 1024 * 1024,
  heapUsed: 5 * 1024 * 1024,
  external: 2 * 1024 * 1024,
  arrayBuffers: 1 * 1024 * 1024,
};

test("formats RSS, heap, external, and array-buffer usage without other process data", () => {
  assert.deepEqual(formatApiMemorySample(sample, new Date("2026-11-05T00:00:00.000Z")), {
    sampledAt: "2026-11-05T00:00:00.000Z",
    rssMiB: 20,
    heapTotalMiB: 10,
    heapUsedMiB: 5,
    externalMiB: 2,
    arrayBuffersMiB: 1,
  });
});

test("diagnostics are disabled by default and create no timer", () => {
  let timerCreated = false;
  const lines: string[] = [];
  startApiMemoryDiagnostics({
    enabled: false,
    sample: () => sample,
    write: (line) => lines.push(line),
    setIntervalFn: (() => {
      timerCreated = true;
      return setInterval(() => {}, 60_000);
    }) as typeof setInterval,
  });
  assert.equal(timerCreated, false);
  assert.equal(lines.length, 0);
});

test("enabled diagnostics log immediately, use a bounded interval, and stop cleanly", () => {
  let callback: (() => void) | undefined;
  let requestedInterval = 0;
  let unrefCalled = false;
  let clearCalled = false;
  const lines: string[] = [];
  const timer = { unref: () => { unrefCalled = true; } } as unknown as ReturnType<typeof setInterval>;
  const stop = startApiMemoryDiagnostics({
    enabled: true,
    intervalMs: 10_000,
    sample: () => sample,
    write: (line) => lines.push(line),
    now: () => new Date("2026-11-05T00:00:00.000Z"),
    setIntervalFn: ((fn: () => void, ms: number) => {
      callback = fn;
      requestedInterval = ms;
      return timer;
    }) as typeof setInterval,
    clearIntervalFn: (() => { clearCalled = true; }) as typeof clearInterval,
  });

  assert.equal(lines.length, 1);
  assert.equal(requestedInterval, 10_000);
  assert.equal(unrefCalled, true);
  callback?.();
  assert.equal(lines.length, 2);
  assert.match(lines[0], /"rssMiB":20/);
  stop();
  callback?.();
  assert.equal(lines.length, 2);
  assert.equal(clearCalled, true);
});

test("invalid diagnostic intervals fall back to a safe interval", () => {
  let requestedInterval = 0;
  const timer = { unref: () => {} } as unknown as ReturnType<typeof setInterval>;
  const stop = startApiMemoryDiagnostics({
    enabled: true,
    intervalMs: 50,
    sample: () => sample,
    write: () => {},
    setIntervalFn: ((_, ms: number) => {
      requestedInterval = ms;
      return timer;
    }) as typeof setInterval,
    clearIntervalFn: (() => {}) as typeof clearInterval,
  });
  assert.equal(requestedInterval, 60_000);
  stop();
});
