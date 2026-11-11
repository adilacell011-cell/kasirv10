import type { Prisma } from "@prisma/client";
import { lockBranch } from "./shift-safety";

const GLOBAL_STOCK_INPUT_LOCK = "alfath-cashier-stock-input:global";

// Shared global locks let different branches accept stock concurrently while
// making the all-branch master switch wait for in-flight stock additions.
export async function lockCashierStockInputForBranch(
  tx: Prisma.TransactionClient,
  branchId: string,
): Promise<void> {
  await lockBranch(tx, branchId);
  await tx.$queryRaw`
    SELECT 1 AS locked
    FROM pg_advisory_xact_lock_shared(hashtextextended(${GLOBAL_STOCK_INPUT_LOCK}, 0))
  `;
}

export async function lockGlobalCashierStockInputUpdate(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$queryRaw`
    SELECT 1 AS locked
    FROM pg_advisory_xact_lock(hashtextextended(${GLOBAL_STOCK_INPUT_LOCK}, 0))
  `;
}
