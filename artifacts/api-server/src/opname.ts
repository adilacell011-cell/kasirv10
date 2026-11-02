import type { Prisma } from "@prisma/client";

export class OpnameConflict extends Error {
  constructor() {
    super("Stok sudah berubah. Muat ulang dan periksa jumlah fisik sebelum menyimpan kembali.");
  }
}

// Run inside the caller's transaction: the comparison and write must be atomic.
export async function applyOpname(
  tx: Prisma.TransactionClient,
  input: { productId: string; branchId: string; oldQty: number; newQty: number; reason?: string },
) {
  const { productId, branchId, oldQty, newQty, reason } = input;
  // A missing stock row represents zero. Concurrent creation is safe because
  // the existing product/branch unique constraint arbitrates the insert.
  if (oldQty === 0) {
    await tx.productStock.createMany({
      data: [{ productId, branchId, qty: 0 }],
      skipDuplicates: true,
    });
  }
  const changed = await tx.productStock.updateMany({
    where: { productId, branchId, qty: oldQty },
    data: { qty: newQty },
  });
  if (changed.count !== 1) throw new OpnameConflict();
  const stock = await tx.productStock.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId } },
  });
  await tx.adjustment.create({
    data: {
      productId, branchId, qty: Math.abs(newQty - oldQty),
      type: newQty > oldQty ? "STOCK_IN" : "STOCK_OUT", reason,
    },
  });
  return stock;
}
