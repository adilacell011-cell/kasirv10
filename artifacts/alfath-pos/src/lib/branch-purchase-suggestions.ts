import { isProductVisibleInBranch } from "./product-visibility";

export type BranchPurchaseSuggestion = {
  product: {
    id: string;
    name: string;
    category?: string | null;
    minStock?: number | string | null;
    visibleBranchIds?: string | null;
  };
  branchId: string;
  branchName: string;
  soldQty30d: number;
  averageDailySales: number;
  currentStock: number;
  minimumStock: number;
  targetStock: number;
  suggestedQty: number;
};

export type BranchShoppingBasketCandidate = {
  product: BranchPurchaseSuggestion["product"];
  branchId: string;
  currentStock: number;
  minimumStock: number;
};

export function buildBranchShoppingBasketCandidates(input: {
  products: readonly BranchPurchaseSuggestion["product"][];
  branchIds: readonly string[];
  stockForProduct: (branchId: string, productId: string) => number;
}): BranchShoppingBasketCandidate[] {
  return input.products.flatMap((product) => {
    const minimumStock = Math.max(0, Math.trunc(Number(product.minStock) || 0));
    if (minimumStock <= 0) return [];
    return input.branchIds.flatMap((branchId) => {
      if (!isProductVisibleInBranch(product.visibleBranchIds, branchId)) return [];
      const currentStock = Math.max(
        0,
        Math.trunc(input.stockForProduct(branchId, product.id) || 0),
      );
      if (currentStock > minimumStock) return [];
      return [{ product, branchId, currentStock, minimumStock }];
    });
  });
}

export function buildBranchPurchaseSuggestions(input: {
  products: readonly BranchPurchaseSuggestion["product"][];
  branchId: string;
  branchName: string;
  salesQty30dByProduct: Readonly<Record<string, number>>;
  stockForProduct: (productId: string) => number;
  targetDays?: number | null;
  categoryFilter?: string;
}): BranchPurchaseSuggestion[] {
  const targetDays = Number.isSafeInteger(input.targetDays) && Number(input.targetDays) > 0
    ? Number(input.targetDays)
    : null;

  return input.products.flatMap((product) => {
    if (!isProductVisibleInBranch(product.visibleBranchIds, input.branchId)) return [];
    if (input.categoryFilter === "Aksesoris" && product.category !== "Aksesoris") return [];
    if (
      input.categoryFilter === "Voucher/Perdana" &&
      (product.category === "Aksesoris" || product.category === "UMUM")
    ) return [];

    const soldQty30d = Math.max(0, Math.trunc(input.salesQty30dByProduct[product.id] ?? 0));
    const averageDailySales = soldQty30d / 30;
    const currentStock = Math.max(0, Math.trunc(input.stockForProduct(product.id) || 0));
    const minimumStock = Math.max(0, Math.trunc(Number(product.minStock) || 0));
    const salesBasedTarget = targetDays === null
      ? 0
      : Math.ceil(averageDailySales * targetDays);
    const targetStock = Math.max(minimumStock, salesBasedTarget);
    const suggestedQty = Math.max(0, targetStock - currentStock);

    if (suggestedQty <= 0) return [];
    return [{
      product,
      branchId: input.branchId,
      branchName: input.branchName,
      soldQty30d,
      averageDailySales,
      currentStock,
      minimumStock,
      targetStock,
      suggestedQty,
    }];
  }).sort((left, right) =>
    right.suggestedQty - left.suggestedQty ||
    right.averageDailySales - left.averageDailySales ||
    left.product.name.localeCompare(right.product.name, "id", { numeric: true }),
  );
}

export function buildBranchBasketPurchaseSuggestions(input: {
  candidates: readonly BranchShoppingBasketCandidate[];
  branchId: string;
  branchName: string;
  salesQty30dByProduct: Readonly<Record<string, number>>;
  stockForProduct: (productId: string) => number;
  targetDays?: number | null;
}): BranchPurchaseSuggestion[] {
  const branchProducts = Array.from(new Map(
    input.candidates
      .filter((candidate) => candidate.branchId === input.branchId)
      .map((candidate) => [candidate.product.id, candidate.product] as const),
  ).values());

  return buildBranchPurchaseSuggestions({
    products: branchProducts,
    branchId: input.branchId,
    branchName: input.branchName,
    salesQty30dByProduct: input.salesQty30dByProduct,
    stockForProduct: input.stockForProduct,
    targetDays: input.targetDays,
  });
}
