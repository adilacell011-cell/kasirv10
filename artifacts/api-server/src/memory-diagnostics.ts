type MemoryBytes = Pick<
  NodeJS.MemoryUsage,
  "rss" | "heapTotal" | "heapUsed" | "external" | "arrayBuffers"
>;

type MemoryDiagnosticsOptions = {
  enabled?: boolean;
  intervalMs?: number;
  sample?: () => MemoryBytes;
  write?: (line: string) => void;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  now?: () => Date;
};

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 300_000;
const MIB = 1024 * 1024;

function validInterval(value: number | undefined): number {
  return Number.isInteger(value) && value! >= MIN_INTERVAL_MS && value! <= MAX_INTERVAL_MS
    ? value!
    : DEFAULT_INTERVAL_MS;
}

export function formatApiMemorySample(memory: MemoryBytes, sampledAt = new Date()) {
  const toMiB = (bytes: number) => Math.round((bytes / MIB) * 100) / 100;
  return {
    sampledAt: sampledAt.toISOString(),
    rssMiB: toMiB(memory.rss),
    heapTotalMiB: toMiB(memory.heapTotal),
    heapUsedMiB: toMiB(memory.heapUsed),
    externalMiB: toMiB(memory.external),
    arrayBuffersMiB: toMiB(memory.arrayBuffers),
  };
}

/**
 * Emits process memory metrics only when explicitly enabled. It never includes
 * request, account, database, or environment-variable values.
 */
export function startApiMemoryDiagnostics(options: MemoryDiagnosticsOptions = {}): () => void {
  const enabled = options.enabled ??
    process.env.KASIRV10_MEMORY_DIAGNOSTICS?.toLowerCase() === "true";
  if (!enabled) return () => {};

  const intervalMs = validInterval(
    options.intervalMs ?? Number(process.env.KASIRV10_MEMORY_DIAGNOSTICS_INTERVAL_MS),
  );
  const sample = options.sample ?? (() => process.memoryUsage());
  const write = options.write ?? ((line: string) => console.info(line));
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const now = options.now ?? (() => new Date());
  let stopped = false;
  const emit = () => {
    if (stopped) return;
    write(`KASIRV10_API_MEMORY_SAMPLE ${JSON.stringify(formatApiMemorySample(sample(), now()))}`);
  };

  emit();
  const timer = setIntervalFn(emit, intervalMs);
  timer.unref?.();
  return () => {
    if (stopped) return;
    stopped = true;
    clearIntervalFn(timer);
  };
}
