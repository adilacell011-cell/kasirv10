import assert from "node:assert/strict";
import test from "node:test";
import { buildPurchasePlanWhatsAppMessage } from "./purchase-plan-whatsapp";

test("formats saved plan quantities by branch and skips empty quantities", () => {
  const message = buildPurchasePlanWhatsAppMessage({
    title: "Belanja Voucher 14 Nov",
    createdAt: "2026-11-14T10:00:00.000Z",
    receipts: [
      { branchId: "branch-a", branchNameSnapshot: "Alfath 2" },
      { branchId: "branch-b", branchNameSnapshot: "Cabang Utama" },
    ],
    items: [
      { productNameSnapshot: "Voucher 2 GB", branchQtys: { "branch-a": 5, "branch-b": 3 } },
      { productNameSnapshot: "Voucher 5 GB", branchQtys: { "branch-a": 0, "branch-b": 2 } },
    ],
  });

  assert.match(message, /Rencana Belanja Alfath Pulsa/);
  assert.match(message, /Belanja Voucher 14 Nov/);
  assert.match(message, /\*📍 Alfath 2\*/);
  assert.match(message, /Voucher 2 GB: 5 pcs/);
  assert.match(message, /Voucher 5 GB: 2 pcs/);
  assert.match(message, /Total Cabang: 5 pcs/);
  assert.match(message, /Total Cabang: 5 pcs/);
  assert.match(message, /TOTAL KESELURUHAN: 10 pcs/);
  assert.doesNotMatch(message, /Voucher 5 GB: 0 pcs/);
});

test("labels branches from current branch data when receipt snapshots are absent", () => {
  const message = buildPurchasePlanWhatsAppMessage(
    {
      title: "Belanja Manual",
      createdAt: "not-a-date",
      items: [{ productNameSnapshot: "Kartu Perdana", branchQtys: { "branch-x": 4 } }],
    },
    [{ id: "branch-x", name: "Alfath 3" }],
  );

  assert.match(message, /\*📍 Alfath 3\*/);
  assert.match(message, /Tanggal tidak tersedia/);
  assert.match(message, /Kartu Perdana: 4 pcs/);
});
