import crypto from "crypto";

export type IdempotencyScope = {
  accountId: string;
  branchId: string;
  key: string;
};

export type SaleIdempotencySnapshot = {
  id: string;
  branchId: string;
  cashierId: string;
  total: number;
  totalCommission: number;
  totalProfit: number;
  status: string;
  createdAt: string;
};

export function hashIdempotencyScope(scope: IdempotencyScope): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([scope.accountId, scope.branchId, scope.key]))
    .digest("hex");
}

export function hashSaleRequest(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function idempotencyPayloadMatches(
  existingPayloadHash: string | null | undefined,
  requestPayloadHash: string,
): boolean {
  return existingPayloadHash === requestPayloadHash;
}

export function createSaleIdempotencySnapshot(sale: {
  id: string;
  branchId: string;
  cashierId: string;
  total: number;
  totalCommission: number;
  totalProfit: number;
  status: string;
  createdAt: Date | string;
}): SaleIdempotencySnapshot {
  return {
    id: sale.id,
    branchId: sale.branchId,
    cashierId: sale.cashierId,
    total: Number(sale.total),
    totalCommission: Number(sale.totalCommission),
    totalProfit: Number(sale.totalProfit),
    status: sale.status,
    createdAt: sale.createdAt instanceof Date
      ? sale.createdAt.toISOString()
      : new Date(sale.createdAt).toISOString(),
  };
}

export function parseSaleIdempotencySnapshot(value: unknown): SaleIdempotencySnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.id !== "string" ||
      typeof snapshot.branchId !== "string" ||
      typeof snapshot.cashierId !== "string" ||
      typeof snapshot.status !== "string" ||
      typeof snapshot.createdAt !== "string" ||
      !Number.isFinite(snapshot.total) ||
      !Number.isFinite(snapshot.totalCommission) ||
      !Number.isFinite(snapshot.totalProfit)) {
    return null;
  }
  return snapshot as unknown as SaleIdempotencySnapshot;
}

export function archivedSaleReplay(snapshot: SaleIdempotencySnapshot) {
  return {
    ...snapshot,
    createdAt: new Date(snapshot.createdAt),
    items: [],
    archived: true,
    replay: true,
  };
}
