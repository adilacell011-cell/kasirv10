import type { Express, RequestHandler } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getLogicalShiftDate } from "./business-date";

export const PRODUCT_SALES_SUMMARY_BATCH_SIZE = 100;
export const PRODUCT_SALES_SUMMARY_INTERVAL_MS = 30_000;
const SUMMARY_ADVISORY_LOCK_CLASS = 180043211;
const SUMMARY_ADVISORY_LOCK_ID = 2;
const MAX_SUMMARY_PAGE_SIZE = 500;

export type ProductSalesSummaryKind = "SALE" | "REFUND";
export type ProductSalesSummaryLine = { productId: string; qty: number };

type EventForSummary = {
  id: string;
  branchId: string;
  saleDate: string;
  kind: string;
  lines: Prisma.JsonValue;
};

type SummaryCursor = { saleDate: string; branchId: string; productId: string };

const isValidDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
};

export function getProductSalesSummaryWindowStart(now = new Date(), days = 30): string {
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error("Ringkasan penjualan hanya dapat dibaca untuk 1–30 hari.");
  }
  const logicalToday = getLogicalShiftDate(now);
  const [year, month, day] = logicalToday.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day - (days - 1)));
  return [
    start.getUTCFullYear(),
    String(start.getUTCMonth() + 1).padStart(2, "0"),
    String(start.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function buildProductSalesSummaryLines(
  items: readonly { productId: string; qty: number }[],
): ProductSalesSummaryLine[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (typeof item.productId !== "string" || !item.productId.trim() ||
        !Number.isInteger(item.qty) || item.qty <= 0) {
      throw new Error("Baris ringkasan penjualan tidak valid.");
    }
    const productId = item.productId.trim();
    totals.set(productId, (totals.get(productId) ?? 0) + item.qty);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([productId, qty]) => ({ productId, qty }));
}

function parseEventLines(value: Prisma.JsonValue): ProductSalesSummaryLine[] {
  if (!Array.isArray(value)) throw new Error("Event ringkasan penjualan memiliki format baris yang tidak valid.");
  return buildProductSalesSummaryLines(value.map((line) => {
    if (!line || typeof line !== "object" || Array.isArray(line) ||
        typeof line.productId !== "string" || typeof line.qty !== "number") {
      throw new Error("Event ringkasan penjualan memiliki format baris yang tidak valid.");
    }
    return { productId: line.productId, qty: line.qty };
  }));
}

export async function enqueueProductSalesSummaryEvent(
  tx: Prisma.TransactionClient,
  input: {
    saleId: string;
    branchId: string;
    saleDate: string;
    kind: ProductSalesSummaryKind;
    items: readonly { productId: string; qty: number }[];
  },
): Promise<void> {
  if (!input.saleId.trim() || !input.branchId.trim() || !isValidDateKey(input.saleDate)) {
    throw new Error("Target event ringkasan penjualan tidak valid.");
  }
  const lines = buildProductSalesSummaryLines(input.items);
  if (lines.length === 0) throw new Error("Event ringkasan penjualan harus memiliki produk.");

  await tx.productSalesSummaryEvent.upsert({
    where: { saleId_kind: { saleId: input.saleId, kind: input.kind } },
    update: {},
    create: {
      saleId: input.saleId,
      branchId: input.branchId,
      saleDate: input.saleDate,
      kind: input.kind,
      lines: lines as Prisma.InputJsonValue,
    },
  });
}

export async function backfillRecentProductSalesSummaryEvents(
  tx: Prisma.TransactionClient,
  now = new Date(),
  batchSize = 250,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("Ukuran batch backfill ringkasan harus 1–1000.");
  }
  const startDate = getProductSalesSummaryWindowStart(now);
  const [year, month, day] = startDate.split("-").map(Number);
  // Logical sales days start at 06:00 WIB (23:00 UTC on the previous date).
  const from = new Date(Date.UTC(year, month - 1, day, -1));
  let cursor: { id: string; createdAt: Date } | undefined;
  let inserted = 0;

  for (;;) {
    const sales = await tx.sale.findMany({
      where: {
        status: "success",
        createdAt: { gte: from, lte: now },
        ...(cursor ? {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        branchId: true,
        createdAt: true,
        items: { select: { productId: true, qty: true } },
      },
    });
    if (sales.length === 0) break;

    const events = sales.flatMap((sale) => {
      const lines = buildProductSalesSummaryLines(sale.items);
      if (lines.length === 0) return [];
      return [{
        saleId: sale.id,
        branchId: sale.branchId,
        saleDate: getLogicalShiftDate(sale.createdAt),
        kind: "SALE",
        lines: lines as Prisma.InputJsonValue,
      }];
    });
    if (events.length > 0) {
      const result = await tx.productSalesSummaryEvent.createMany({
        data: events,
        skipDuplicates: true,
      });
      inserted += result.count;
    }

    const lastSale = sales.at(-1)!;
    cursor = { id: lastSale.id, createdAt: lastSale.createdAt };
    if (sales.length < batchSize) break;
  }
  return inserted;
}

type ProductSalesSummaryBatchResult = {
  locked: boolean;
  processed: number;
  prunedEvents: number;
  prunedSummaries: number;
};

export async function processProductSalesSummaryBatch(
  prisma: PrismaClient,
  now = new Date(),
  batchSize = PRODUCT_SALES_SUMMARY_BATCH_SIZE,
): Promise<ProductSalesSummaryBatchResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("Ukuran batch ringkasan harus 1–1000.");
  }
  const windowStart = getProductSalesSummaryWindowStart(now);

  return prisma.$transaction(async (tx) => {
    const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(
        ${SUMMARY_ADVISORY_LOCK_CLASS}::int4,
        ${SUMMARY_ADVISORY_LOCK_ID}::int4
      ) AS locked`;
    if (!lockRows[0]?.locked) {
      return { locked: false, processed: 0, prunedEvents: 0, prunedSummaries: 0 };
    }

    const prunedEventRows = await tx.$queryRaw<{ id: string }[]>`
      WITH expired AS (
        SELECT id FROM "ProductSalesSummaryEvent"
         WHERE "saleDate" < ${windowStart}
         ORDER BY "saleDate", "createdAt", id
         LIMIT ${batchSize}
         FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "ProductSalesSummaryEvent" event
       USING expired
       WHERE event.id = expired.id
       RETURNING event.id`;
    const prunedSummaryRows = await tx.$queryRaw<{ id: string }[]>`
      WITH expired AS (
        SELECT id FROM "DailyProductSalesSummary"
         WHERE "saleDate" < ${windowStart}
         ORDER BY "saleDate", id
         LIMIT ${batchSize}
         FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "DailyProductSalesSummary" summary
       USING expired
       WHERE summary.id = expired.id
       RETURNING summary.id`;

    const eventIds = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
        FROM "ProductSalesSummaryEvent"
       WHERE "processedAt" IS NULL AND "saleDate" >= ${windowStart}
       ORDER BY "createdAt", id
       LIMIT ${batchSize}
       FOR UPDATE SKIP LOCKED`;
    const ids = eventIds.map((row) => row.id);
    if (ids.length === 0) {
      return {
        locked: true,
        processed: 0,
        prunedEvents: prunedEventRows.length,
        prunedSummaries: prunedSummaryRows.length,
      };
    }

    const fetchedEvents = await tx.productSalesSummaryEvent.findMany({
      where: { id: { in: ids } },
      select: { id: true, branchId: true, saleDate: true, kind: true, lines: true },
    });
    const eventsById = new Map(fetchedEvents.map((event) => [event.id, event]));
    const events: EventForSummary[] = ids.map((id) => {
      const event = eventsById.get(id);
      if (!event) throw new Error("Event ringkasan penjualan menghilang selama pemrosesan.");
      return event;
    });

    const deltas = new Map<string, {
      branchId: string; productId: string; saleDate: string; qty: number;
    }>();
    for (const event of events) {
      if (!isValidDateKey(event.saleDate) || !event.branchId.trim() ||
          (event.kind !== "SALE" && event.kind !== "REFUND")) {
        throw new Error("Event ringkasan penjualan memiliki target atau jenis yang tidak valid.");
      }
      const direction = event.kind === "SALE" ? 1 : -1;
      for (const line of parseEventLines(event.lines)) {
        const key = JSON.stringify([event.branchId, line.productId, event.saleDate]);
        const current = deltas.get(key) ?? {
          branchId: event.branchId,
          productId: line.productId,
          saleDate: event.saleDate,
          qty: 0,
        };
        current.qty += direction * line.qty;
        deltas.set(key, current);
      }
    }

    for (const delta of deltas.values()) {
      if (delta.qty === 0) continue;
      const where = {
        branchId_productId_saleDate: {
          branchId: delta.branchId,
          productId: delta.productId,
          saleDate: delta.saleDate,
        },
      };
      const existing = await tx.dailyProductSalesSummary.findUnique({
        where,
        select: { id: true, qty: true },
      });
      const nextQty = (existing?.qty ?? 0) + delta.qty;
      if (nextQty < 0) {
        throw new Error("Refund ringkasan penjualan melebihi jumlah penjualan yang tercatat.");
      }
      if (nextQty === 0) {
        if (existing) await tx.dailyProductSalesSummary.delete({ where: { id: existing.id } });
      } else {
        await tx.dailyProductSalesSummary.upsert({
          where,
          update: { qty: { increment: delta.qty } },
          create: {
            branchId: delta.branchId,
            productId: delta.productId,
            saleDate: delta.saleDate,
            qty: delta.qty,
          },
        });
      }
    }

    const marked = await tx.productSalesSummaryEvent.updateMany({
      where: { id: { in: ids }, processedAt: null },
      data: { processedAt: now },
    });
    if (marked.count !== ids.length) {
      throw new Error("Sebagian event ringkasan penjualan tidak berhasil ditandai selesai.");
    }

    return {
      locked: true,
      processed: ids.length,
      prunedEvents: prunedEventRows.length,
      prunedSummaries: prunedSummaryRows.length,
    };
  }, { maxWait: 5_000, timeout: 30_000 });
}

export function startProductSalesSummaryWorker(
  prisma: PrismaClient,
  options: {
    intervalMs?: number;
    setIntervalFn?: typeof setInterval;
    clearIntervalFn?: typeof clearInterval;
    log?: (message: string, error?: unknown) => void;
  } = {},
): () => void {
  const intervalMs = options.intervalMs ?? PRODUCT_SALES_SUMMARY_INTERVAL_MS;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const log = options.log ?? ((message, error) => {
    if (error) console.error(message, error);
    else console.log(message);
  });
  let running = false;
  let stopped = false;

  const run = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const result = await processProductSalesSummaryBatch(prisma);
      if (result.processed || result.prunedEvents || result.prunedSummaries) {
        log(
          `Product sales summary batch: ${result.processed} events processed; ` +
          `${result.prunedEvents} expired events and ${result.prunedSummaries} old summaries pruned.`,
        );
      }
    } catch (error) {
      log("Product sales summary batch failed; pending events remain available for retry.", error);
    } finally {
      running = false;
    }
  };

  const timer = setIntervalFn(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return () => {
    stopped = true;
    clearIntervalFn(timer);
  };
}

function parseCursor(value: unknown): SummaryCursor | null | false {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SummaryCursor>;
    if (typeof parsed.saleDate !== "string" || !isValidDateKey(parsed.saleDate) ||
        typeof parsed.branchId !== "string" || !parsed.branchId ||
        typeof parsed.productId !== "string" || !parsed.productId) return false;
    return {
      saleDate: parsed.saleDate,
      branchId: parsed.branchId,
      productId: parsed.productId,
    };
  } catch {
    return false;
  }
}

export function registerProductSalesSummaryRoutes(
  app: Express,
  prisma: PrismaClient,
  authenticate: RequestHandler,
  requireRole: (...roles: string[]) => RequestHandler,
): void {
  app.get("/api/product-sales-summary", authenticate, requireRole("ADMIN"), async (req, res) => {
    const daysValue = req.query.days;
    const days = daysValue === undefined ? 30 : Number(daysValue);
    const limitValue = req.query.limit;
    const limit = limitValue === undefined ? 100 : Number(limitValue);
    const branchIdValue = req.query.branchId;
    const branchId = branchIdValue === undefined ? undefined : branchIdValue;
    const cursor = parseCursor(req.query.cursor);

    if (!Number.isInteger(days) || days < 1 || days > 30 ||
        !Number.isInteger(limit) || limit < 1 || limit > MAX_SUMMARY_PAGE_SIZE ||
        (branchId !== undefined && (typeof branchId !== "string" || !branchId.trim() || branchId.length > 128)) ||
        cursor === false) {
      res.status(400).json({ error: "Filter ringkasan penjualan tidak valid." });
      return;
    }

    try {
      const now = new Date();
      const today = getLogicalShiftDate(now);
      const start = getProductSalesSummaryWindowStart(now, days);
      const cursorFilter = cursor ? {
        OR: [
          { saleDate: { gt: cursor.saleDate } },
          { saleDate: cursor.saleDate, branchId: { gt: cursor.branchId } },
          {
            saleDate: cursor.saleDate,
            branchId: cursor.branchId,
            productId: { gt: cursor.productId },
          },
        ],
      } : {};
      const rows = await prisma.dailyProductSalesSummary.findMany({
        where: {
          saleDate: { gte: start, lte: today },
          ...(typeof branchId === "string" ? { branchId: branchId.trim() } : {}),
          ...cursorFilter,
        },
        orderBy: [{ saleDate: "asc" }, { branchId: "asc" }, { productId: "asc" }],
        take: limit + 1,
        select: { branchId: true, productId: true, saleDate: true, qty: true },
      });
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      const nextCursor = hasMore && last
        ? Buffer.from(JSON.stringify({
            saleDate: last.saleDate,
            branchId: last.branchId,
            productId: last.productId,
          })).toString("base64url")
        : null;
      res.json({ days, startDate: start, endDate: today, items, hasMore, nextCursor });
    } catch {
      res.status(500).json({ error: "Gagal mengambil ringkasan penjualan produk." });
    }
  });
}
