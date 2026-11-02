import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { applyOpname, OpnameConflict } from "./opname";

function fixture() {
  const rows = new Map([["a:p", 11], ["b:p", 20]]);
  const logs: any[] = [];
  const tx = {
    productStock: {
      createMany: async ({ data }: any) => {
        for (const row of data) {
          const key = `${row.branchId}:${row.productId}`;
          if (!rows.has(key)) rows.set(key, row.qty);
        }
      },
      updateMany: async ({ where, data }: any) => {
        const key = `${where.branchId}:${where.productId}`;
        if (rows.get(key) !== where.qty) return { count: 0 };
        rows.set(key, data.qty);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where: { productId_branchId: key } }: any) => ({
        ...key, qty: rows.get(`${key.branchId}:${key.productId}`),
      }),
    },
    adjustment: { create: async ({ data }: any) => { logs.push(data); } },
  } as unknown as Prisma.TransactionClient;
  return { tx, rows, logs };
}

test("A and B remain isolated; adjustment uses each branch's own baseline", async () => {
  const { tx, rows, logs } = fixture();
  await applyOpname(tx, { branchId: "a", productId: "p", oldQty: 11, newQty: 13 });
  assert.equal(rows.get("b:p"), 20);
  await applyOpname(tx, { branchId: "b", productId: "p", oldQty: 20, newQty: 18 });
  assert.equal(rows.get("a:p"), 13);
  assert.deepEqual(logs.map(({ branchId, qty, type }) => ({ branchId, qty, type })), [
    { branchId: "a", qty: 2, type: "STOCK_IN" },
    { branchId: "b", qty: 2, type: "STOCK_OUT" },
  ]);
});

test("A's old quantity cannot overwrite B; conflicts create no adjustment", async () => {
  const { tx, rows, logs } = fixture();
  await assert.rejects(applyOpname(tx, {
    branchId: "b", productId: "p", oldQty: 11, newQty: 12,
  }), OpnameConflict);
  assert.equal(rows.get("b:p"), 20);
  assert.equal(logs.length, 0);
});

test("two writers with the same baseline: exactly one wins", async () => {
  const { tx, rows, logs } = fixture();
  const results = await Promise.allSettled([12, 13].map(newQty =>
    applyOpname(tx, { branchId: "a", productId: "p", oldQty: 11, newQty }),
  ));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.ok([12, 13].includes(rows.get("a:p")!));
  assert.equal(rows.get("b:p"), 20);
  assert.equal(logs.length, 1);
});

test("missing stock is zero, and a second stale zero baseline cannot overwrite it", async () => {
  const { tx, rows, logs } = fixture();
  await applyOpname(tx, { branchId: "a", productId: "new", oldQty: 0, newQty: 5 });
  await assert.rejects(applyOpname(tx, {
    branchId: "a", productId: "new", oldQty: 0, newQty: 6,
  }), OpnameConflict);
  assert.equal(rows.get("a:new"), 5);
  assert.equal(logs.length, 1);
});
