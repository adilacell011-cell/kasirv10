import crypto from "crypto";

export type IdempotencyScope = {
  accountId: string;
  branchId: string;
  key: string;
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
