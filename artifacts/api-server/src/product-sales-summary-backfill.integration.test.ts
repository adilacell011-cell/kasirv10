import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  backfillRecentProductSalesSummaryEvents,
  processProductSalesSummaryBatch,
} from "./product-sales-summary";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_PRODUCT_SALES_SUMMARY_DB_TESTS === "1" && Boolean(databaseUrl);

test("historical backfill is limited to successful sales in the 30-day WIB window and can rerun", {
  skip: !runIntegration,
}, async () => {
  const parsed = new URL(databaseUrl!);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "integration tests require local PostgreSQL");
  assert.equal(parsed.pathname, "/product_sales_summary_test", "use only the disposable integration database");
  if (process.env.DATABASE_URL) assert.notEqual(databaseUrl, process.env.DATABASE_URL);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const branchId = `summary-backfill-${randomUUID()}`;
  const userId = `cashier-${randomUUID()}`;
  const productId = `product-${randomUUID()}`;
  const includedSaleId = `sale-${randomUUID()}`;
  const refundedSaleId = `sale-${randomUUID()}`;
  const expiredSaleId = `sale-${randomUUID()}`;
  const now = new Date("2026-11-14T10:00:00.000Z");

  try {
    await prisma.$connect();
    await prisma.branch.create({ data: { id: branchId, name: branchId } });
    await prisma.user.create({
      data: { id: userId, username: userId, password: "integration-only", branchId },
    });
    await prisma.product.create({
      data: {
        id: productId,
        name: productId,
        buyingPrice: 1,
        sellingPrice: 2,
      },
    });
    const makeSale = (id: string, status: string, createdAt: Date, qty: number) => prisma.sale.create({
      data: {
        id,
        branchId,
        cashierId: userId,
        total: 2 * qty,
        totalCommission: 0,
        status,
        createdAt,
        items: {
          create: [{ productId, qty, price: 2, costPrice: 1, subtotal: 2 * qty }],
        },
      },
    });
    await makeSale(includedSaleId, "success", new Date("2026-11-14T09:00:00.000Z"), 3);
    await makeSale(refundedSaleId, "refunded", new Date("2026-11-13T09:00:00.000Z"), 9);
    // 05:30 WIB on Oct 16 belongs to the prior logical business date (Oct 15).
    await makeSale(expiredSaleId, "success", new Date("2026-10-15T22:30:00.000Z"), 7);

    const firstRun = await prisma.$transaction((tx) =>
      backfillRecentProductSalesSummaryEvents(tx, now, 2));
    const secondRun = await prisma.$transaction((tx) =>
      backfillRecentProductSalesSummaryEvents(tx, now, 2));
    assert.equal(firstRun, 1, "only the successful in-window sale should be queued");
    assert.equal(secondRun, 0, "rerunning the backfill must not duplicate its sale event");
    assert.equal(
      await prisma.productSalesSummaryEvent.count({
        where: { saleId: { in: [includedSaleId, refundedSaleId, expiredSaleId] } },
      }),
      1,
    );

    const processed = await processProductSalesSummaryBatch(prisma, now, 10);
    assert.equal(processed.processed, 1);
    assert.equal(
      (await prisma.dailyProductSalesSummary.findUnique({
        where: {
          branchId_productId_saleDate: {
            branchId,
            productId,
            saleDate: "2026-11-14",
          },
        },
      }))?.qty,
      3,
    );
  } finally {
    const saleIds = [includedSaleId, refundedSaleId, expiredSaleId];
    await prisma.productSalesSummaryEvent.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.dailyProductSalesSummary.deleteMany({ where: { branchId, productId } });
    await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.$disconnect();
  }
});
