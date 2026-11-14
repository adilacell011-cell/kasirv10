type PurchasePlanShareItem = {
  productNameSnapshot?: unknown;
  branchQtys?: unknown;
};

type PurchasePlanShareReceipt = {
  branchId: string;
  branchNameSnapshot: string;
};

export type PurchasePlanShareData = {
  title: string;
  createdAt: Date | string;
  items: readonly PurchasePlanShareItem[];
  receipts?: readonly PurchasePlanShareReceipt[];
};

export function buildPurchasePlanWhatsAppMessage(
  plan: PurchasePlanShareData,
  branches: readonly { id: string; name: string }[] = [],
): string {
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  for (const receipt of plan.receipts || []) {
    if (receipt.branchNameSnapshot.trim()) {
      branchNameById.set(receipt.branchId, receipt.branchNameSnapshot);
    }
  }

  const branchGroups = new Map<string, Array<{ productName: string; qty: number }>>();
  for (const item of plan.items) {
    const productName = typeof item.productNameSnapshot === "string" && item.productNameSnapshot.trim()
      ? item.productNameSnapshot.trim()
      : "Produk";
    if (!item.branchQtys || typeof item.branchQtys !== "object" || Array.isArray(item.branchQtys)) {
      continue;
    }

    for (const [branchId, rawQty] of Object.entries(item.branchQtys as Record<string, unknown>)) {
      const qty = typeof rawQty === "number" ? rawQty : Number(rawQty);
      if (!Number.isSafeInteger(qty) || qty <= 0) continue;
      const items = branchGroups.get(branchId) || [];
      items.push({ productName, qty });
      branchGroups.set(branchId, items);
    }
  }

  const sortedBranches = Array.from(branchGroups.entries()).sort(([leftId], [rightId]) =>
    (branchNameById.get(leftId) || leftId).localeCompare(
      branchNameById.get(rightId) || rightId,
      "id",
      { numeric: true },
    ),
  );
  const createdAt = new Date(plan.createdAt);
  const dateText = Number.isNaN(createdAt.getTime())
    ? "Tanggal tidak tersedia"
    : createdAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  let message = `*Rencana Belanja Alfath Pulsa*\n*${plan.title}*\n_Tanggal: ${dateText}_\n\n`;
  let totalQty = 0;

  for (const [branchId, items] of sortedBranches) {
    const branchName = branchNameById.get(branchId) || branchId;
    items.sort((left, right) =>
      left.productName.localeCompare(right.productName, "id", { numeric: true }),
    );
    const branchTotal = items.reduce((sum, item) => sum + item.qty, 0);
    message += `*📍 ${branchName}*\n`;
    for (const item of items) {
      message += `  • ${item.productName}: ${item.qty} pcs\n`;
    }
    message += `  _> Total Cabang: ${branchTotal} pcs_\n\n`;
    totalQty += branchTotal;
  }

  if (sortedBranches.length === 0) {
    message += "_Belum ada jumlah belanja yang terisi._\n\n";
  }

  message += `*➤ TOTAL KESELURUHAN: ${totalQty} pcs*\n\n_Mohon segera diproses, terima kasih._`;
  return message;
}
