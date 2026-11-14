import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  backfillRecentProductSalesSummaryEvents,
  enqueueProductSalesSummaryEvent,
  processProductSalesSummaryBatch,
} from "./product-sales-summary";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_PRODUCT_SALES_SUMMARY_DB_TESTS === "1" && Boolean(databaseUrl);

test("product sales outbox retries safely and refunds remove demand", { skip: !runIntegration }, async () => {
  const parsed = new URL(databaseUrl!);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "integration tests require local PostgreSQL");
  assert.equal(parsed.pathname, "/product_sales_summary_test", "use only the disposable integration database");
  if (process.env.DATABASE_URL) assert.notEqual(databaseUrl, process.env.DATABASE_URL);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const branchId = `summary-test-${randomUUID()}`;
  const productId = `product-${randomUUID()}`;
  const saleId = `sale-${randomUUID()}`;
  const invalidSaleId = `sale-${randomUUID()}`;
  const bulkSaleIds = Array.from({ length: 105 }, () => `sale-${randomUUID()}`);
  const saleDate = "2026-11-14";

  try {
    await prisma.$connect();
    await prisma.$transaction(async (tx) => {
      await enqueueProductSalesSummaryEvent(tx, {
        saleId,
        branchId,
        saleDate,
        kind: "SALE",
        items: [{ productId, qty: 5 }],
      });
      await enqueueProductSalesSummaryEvent(tx, {
        saleId,
        branchId,
        saleDate,
        kind: "SALE",
        items: [{ productId, qty: 5 }],
      });
    });

    assert.equal(
      await prisma.productSalesSummaryEvent.count({ where: { saleId, kind: "SALE" } }),
      1,
      "a retry must not create a second event",
    );
    const firstBatch = await processProductSalesSummaryBatch(prisma, new Date("2026-11-14T10:00:00.000Z"), 10);
    assert.equal(firstBatch.processed, 1);
    assert.equal(
      (await prisma.dailyProductSalesSummary.findUnique({
        where: { branchId_productId_saleDate: { branchId, productId, saleDate } },
      }))?.qty,
      5,
    );

    const retryBatch = await processProductSalesSummaryBatch(prisma, new Date("2026-11-14T10:01:00.000Z"), 10);
    assert.equal(retryBatch.processed, 0, "reprocessing an acknowledged batch must not increment twice");

    await prisma.$transaction((tx) => enqueueProductSalesSummaryEvent(tx, {
      saleId,
      branchId,
      saleDate,
      kind: "REFUND",
      items: [{ productId, qty: 5 }],
    }));
    const refundBatch = await processProductSalesSummaryBatch(prisma, new Date("2026-11-14T10:02:00.000Z"), 10);
    assert.equal(refundBatch.processed, 1);
    assert.equal(
      await prisma.dailyProductSalesSummary.findUnique({
        where: { branchId_productId_saleDate: { branchId, productId, saleDate } },
      }),
      null,
      "a fully refunded product quantity must no longer count as demand",
    );

    await prisma.$transaction(async (tx) => {
      await enqueueProductSalesSummaryEvent(tx, {
        saleId: invalidSaleId,
        branchId,
        saleDate,
        kind: "SALE",
        items: [{ productId, qty: 1 }],
      });
      await enqueueProductSalesSummaryEvent(tx, {
        saleId: invalidSaleId,
        branchId,
        saleDate,
        kind: "REFUND",
        items: [{ productId, qty: 2 }],
      });
    });
    await assert.rejects(
      processProductSalesSummaryBatch(prisma, new Date("2026-11-14T10:03:00.000Z"), 10),
      /melebihi jumlah penjualan/,
    );
    assert.equal(
      await prisma.dailyProductSalesSummary.findUnique({
        where: { branchId_productId_saleDate: { branchId, productId, saleDate } },
      }),
      null,
      "an invalid over-refund must roll back the whole event batch",
    );
    assert.equal(
      await prisma.productSalesSummaryEvent.count({ where: { saleId: invalidSaleId, processedAt: null } }),
      2,
      "failed events stay pending so they can be inspected and retried",
    );

    await prisma.productSalesSummaryEvent.deleteMany({ where: { saleId: invalidSaleId } });
    await prisma.productSalesSummaryEvent.createMany({
      data: bulkSaleIds.map((bulkId) => ({
        saleId: bulkId,
        branchId,
        saleDate,
        kind: "SALE",
        lines: [{ productId, qty: 1 }],
      })),
    });
    const boundedFirstBatch = await processProductSalesSummaryBatch(
      prisma,
      new Date("2026-11-14T10:04:00.000Z"),
      100,
    );
    assert.equal(boundedFirstBatch.processed, 100, "one run must respect its configured batch bound");
    assert.equal(
      (await prisma.dailyProductSalesSummary.findUnique({
        where: { branchId_productId_saleDate: { branchId, productId, saleDate } },
      }))?.qty,
      100,
    );
    const boundedSecondBatch = await processProductSalesSummaryBatch(
      prisma,
      new Date("2026-11-14T10:05:00.000Z"),
      100,
    );
    assert.equal(boundedSecondBatch.processed, 5);
    assert.equal(
      (await prisma.dailyProductSalesSummary.findUnique({
        where: { branchId_productId_saleDate: { branchId, productId, saleDate } },
      }))?.qty,
      105,
    );
  } finally {
    await prisma.productSalesSummaryEvent.deleteMany({
      where: { saleId: { in: [saleId, invalidSaleId, ...bulkSaleIds] } },
    });
    await prisma.dailyProductSalesSummary.deleteMany({
      where: { branchId, productId },
    });
    await prisma.$disconnect();
  }
});
