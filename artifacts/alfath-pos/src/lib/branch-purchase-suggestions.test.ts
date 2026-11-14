import assert from "node:assert/strict";
import test from "node:test";
import { buildBranchPurchaseSuggestions } from "./branch-purchase-suggestions";

const products = [
  { id: "fast", name: "Voucher 2 GB", category: "Voucher", minStock: 8, visibleBranchIds: "*" },
  { id: "slow", name: "Voucher 5 GB", category: "Voucher", minStock: 3, visibleBranchIds: "*" },
  { id: "hidden", name: "Voucher 10 GB", category: "Voucher", minStock: 5, visibleBranchIds: "branch-b" },
];

test("purchase suggestion tops up to the existing minimum when no coverage target is selected", () => {
  const suggestions = buildBranchPurchaseSuggestions({
    products,
    branchId: "branch-a",
    branchName: "Alfath 1",
    salesQty30dByProduct: { fast: 60, slow: 0 },
    stockForProduct: (productId) => productId === "fast" ? 5 : 1,
  });

  assert.deepEqual(
    suggestions.map((suggestion) => [suggestion.product.id, suggestion.suggestedQty, suggestion.targetStock]),
    [["fast", 3, 8], ["slow", 2, 3]],
  );
});

test("selected coverage days use sales velocity while keeping minimum stock as a floor", () => {
  const [suggestion] = buildBranchPurchaseSuggestions({
    products,
    branchId: "branch-a",
    branchName: "Alfath 1",
    salesQty30dByProduct: { fast: 60 },
    stockForProduct: () => 5,
    targetDays: 7,
  });

  assert.equal(suggestion.averageDailySales, 2);
  assert.equal(suggestion.targetStock, 14);
  assert.equal(suggestion.suggestedQty, 9);
});

test("suggestions exclude hidden products and products already at their target", () => {
  const suggestions = buildBranchPurchaseSuggestions({
    products,
    branchId: "branch-a",
    branchName: "Alfath 1",
    salesQty30dByProduct: { fast: 60, hidden: 300 },
    stockForProduct: (productId) => productId === "fast" ? 14 : 3,
    targetDays: 7,
  });

  assert.deepEqual(suggestions, []);
});

test("target days must be a positive integer and product categories remain filterable", () => {
  const suggestions = buildBranchPurchaseSuggestions({
    products,
    branchId: "branch-a",
    branchName: "Alfath 1",
    salesQty30dByProduct: { fast: 60, slow: 15 },
    stockForProduct: () => 0,
    targetDays: 0,
    categoryFilter: "Aksesoris",
  });

  assert.deepEqual(suggestions, []);
});
