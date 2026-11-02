import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { applyStockDelta, InsufficientAdjustmentStock } from "./stock-adjustment";

function fixture(initial: number | null) {
  const rows = new Map<string, number>();
  if (initial !== null) rows.set("A", initial);
  rows.set("B", 30);
  let upserts = 0;
  const tx = {
    productStock: {
      updateMany: async ({ where, data }: {
        where: { productId: string; branchId: string; qty: { gte: number } };
        data: { qty: { increment: number } };
      }) => {
        assert.equal(where.productId, "product");
        const current = rows.get(where.branchId);
        if (current === undefined || current < where.qty.gte) return { count: 0 };
        rows.set(where.branchId, current + data.qty.increment);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: {
        where: { productId_branchId: { productId: string; branchId: string } };
      }) => ({ qty: rows.get(where.productId_branchId.branchId) }),
      upsert: async ({ where, update, create }: {
        where: { productId_branchId: { productId: string; branchId: string } };
        update: { qty: { increment: number } };
        create: { qty: number };
      }) => {
        upserts++;
        const branch = where.productId_branchId.branchId;
        const current = rows.get(branch);
        rows.set(branch, current === undefined ? create.qty : current + update.qty.increment);
        return { qty: rows.get(branch) };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, rows, upserts: () => upserts };
}

test("C2: oversized removal is rejected without changing either branch", async () => {
  const f = fixture(22);
  await assert.rejects(applyStockDelta(f.tx, "product", "A", -23), InsufficientAdjustmentStock);
  assert.equal(f.rows.get("A"), 22);
  assert.equal(f.rows.get("B"), 30);
  assert.equal(f.upserts(), 0);
});

test("C2: a missing stock row is not created by a debit", async () => {
  const f = fixture(null);
  await assert.rejects(applyStockDelta(f.tx, "product", "A", -1), InsufficientAdjustmentStock);
  assert.equal(f.rows.has("A"), false);
  assert.equal(f.upserts(), 0);
});

test("C2: valid removal may reach zero, not below", async () => {
  const f = fixture(5);
  await applyStockDelta(f.tx, "product", "A", -5);
  assert.equal(f.rows.get("A"), 0);
  await assert.rejects(applyStockDelta(f.tx, "product", "A", -1), InsufficientAdjustmentStock);
  assert.equal(f.rows.get("A"), 0);
  assert.equal(f.rows.get("B"), 30);
});

test("C2: competing guarded debits admit only the affordable request", async () => {
  const f = fixture(22);
  const results = await Promise.allSettled([
    applyStockDelta(f.tx, "product", "A", -15),
    applyStockDelta(f.tx, "product", "A", -15),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.equal(f.rows.get("A"), 7);
  assert.equal(f.rows.get("B"), 30);
});

test("stock intake keeps the existing increment/create behavior", async () => {
  const f = fixture(22);
  await applyStockDelta(f.tx, "product", "A", 3);
  assert.equal(f.rows.get("A"), 25);
  const missing = fixture(null);
  await applyStockDelta(missing.tx, "product", "A", 4);
  assert.equal(missing.rows.get("A"), 4);
});
