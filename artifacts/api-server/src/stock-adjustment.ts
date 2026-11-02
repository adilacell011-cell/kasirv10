import type { Prisma } from "@prisma/client";

export class InsufficientAdjustmentStock extends Error {
  constructor() {
    super("Stok tidak mencukupi untuk pengurangan ini.");
  }
}

// The caller's transaction also records the adjustment. A failed debit must
// neither create a negative stock row nor leave an adjustment record behind.
export async function applyStockDelta(
  tx: Prisma.TransactionClient,
  productId: string,
  branchId: string,
  qty: number,
) {
  if (qty < 0) {
    const changed = await tx.productStock.updateMany({
      where: { productId, branchId, qty: { gte: -qty } },
      data: { qty: { increment: qty } },
    });
    if (changed.count !== 1) throw new InsufficientAdjustmentStock();
    return tx.productStock.findUniqueOrThrow({
      where: { productId_branchId: { productId, branchId } },
    });
  }

  return tx.productStock.upsert({
    where: { productId_branchId: { productId, branchId } },
    update: { qty: { increment: qty } },
    create: { productId, branchId, qty },
  });
}
