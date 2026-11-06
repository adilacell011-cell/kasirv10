import type {
  AuditCandidate,
  AuditItem,
  AuditPage,
  AuditPageApi,
  AuditSession,
} from "./_BranchStockAuditPage";

const branchId = "branch-cendana";

const items: AuditItem[] = [
  { id: "audit-item-01", productId: "fixture-prod-101", productName: "Kabel Data Type-C 1 m", barcode: "89911000101", status: "COUNTED", inScope: true, expectedQty: 12, systemQty: 12, baselineQty: 12, countedQty: 11, variance: -1, finding: "NORMAL", notes: "", countedByName: "Alya P.", countedAt: "2025-04-30T09:12:00.000Z" },
  { id: "audit-item-02", productId: "fixture-prod-102", productName: "Headset Stereo Basic", barcode: "89911000102", status: "COUNTED", inScope: true, expectedQty: 2, systemQty: 2, baselineQty: 2, countedQty: 2, variance: 0, finding: "NORMAL", notes: "" },
  { id: "audit-item-03", productId: "fixture-prod-103", productName: "Charger USB 2 Port", barcode: "89911000103", status: "PENDING", inScope: true, expectedQty: 8, systemQty: 8 },
  { id: "audit-item-04", productId: "fixture-prod-104", productName: "Voucher PLN 20.000", barcode: "89911000104", status: "PENDING", inScope: true, expectedQty: 14, systemQty: 14 },
  { id: "audit-item-05", productId: "fixture-prod-105", productName: "Pulsa 25.000", barcode: "89911000105", status: "COUNTED", inScope: true, expectedQty: 20, systemQty: 20, baselineQty: 20, countedQty: 20, variance: 0, finding: "NORMAL", notes: "" },
  { id: "audit-item-06", productId: "fixture-prod-106", productName: "Kartu Perdana Data", barcode: "89911000106", status: "PENDING", inScope: true, expectedQty: 6, systemQty: 6 },
  { id: "audit-item-07", productId: "fixture-prod-107", productName: "Power Bank Compact", barcode: "89911000107", status: "RECOUNT_REQUIRED", inScope: true, expectedQty: 4, systemQty: 4, baselineQty: 4, countedQty: 1, variance: -3, finding: "NORMAL", notes: "Hitung ulang diperlukan." },
  { id: "audit-item-08", productId: "fixture-prod-108", productName: "Kabel Audio 3.5 mm", barcode: "89911000108", status: "PENDING", inScope: true, expectedQty: 9, systemQty: 9 },
  { id: "audit-item-09", productId: "fixture-prod-109", productName: "Adaptor Universal", barcode: "89911000109", status: "EXCLUDED", inScope: false, expectedQty: 0, systemQty: 0, finding: "NOT_SOLD_HERE", notes: "Tidak dijual di lokasi." },
];

let session: AuditSession | null = {
  id: "fixture-audit-cendana-apr",
  branchId,
  branchName: "Cendana",
  status: "IN_PROGRESS",
  startedAt: "2025-04-30T08:00:00.000Z",
  startedByName: "Alya Pratama",
  summary: {
    totalProducts: items.length,
    counted: 3,
    pending: 4,
    counting: 0,
    recountRequired: 1,
    excluded: 1,
    positiveVariance: 0,
    negativeVariance: -1,
    netVariance: -1,
  },
};

const updateSummary = () => {
  if (!session) return;
  const eligible = items.filter((item) => item.status !== "EXCLUDED");
  const variances = items.map((item) => item.variance ?? 0);
  session = {
    ...session,
    summary: {
      totalProducts: items.length,
      counted: items.filter((item) => item.status === "COUNTED").length,
      pending: items.filter((item) => item.status === "PENDING").length,
      counting: items.filter((item) => item.status === "COUNTING").length,
      recountRequired: items.filter((item) => item.status === "RECOUNT_REQUIRED").length,
      excluded: items.filter((item) => item.status === "EXCLUDED").length,
      positiveVariance: variances.filter((value) => value > 0).reduce((sum, value) => sum + value, 0),
      negativeVariance: variances.filter((value) => value < 0).reduce((sum, value) => sum + value, 0),
      netVariance: eligible.reduce((sum, item) => sum + (item.variance ?? 0), 0),
    },
  };
};

const pageItems = (params: { page: number; pageSize: number; search?: string; status?: string }): AuditItem[] => {
  const query = params.search?.trim().toLowerCase() ?? "";
  const filtered = items.filter((item) =>
    (!params.status || item.status === params.status) &&
    (!query || `${item.productName} ${item.barcode ?? ""} ${item.masterSN ?? ""}`.toLowerCase().includes(query)),
  );
  const start = (params.page - 1) * params.pageSize;
  return filtered.slice(start, start + params.pageSize);
};

export const auditFixtureApi: AuditPageApi = {
  async getCurrent(requestedBranchId) {
    return requestedBranchId === branchId && session ? structuredClone(session) : null;
  },
  async getItems(_auditId, params): Promise<AuditPage> {
    const filtered = items.filter((item) =>
      (!params.status || item.status === params.status) &&
      (!params.search?.trim() || `${item.productName} ${item.barcode ?? ""} ${item.masterSN ?? ""}`.toLowerCase().includes(params.search.trim().toLowerCase())),
    );
    return {
      items: pageItems(params).map((item) => structuredClone(item)),
      page: params.page,
      pageSize: params.pageSize,
      total: filtered.length,
    };
  },
  async searchCandidates(_auditId, search): Promise<{ items: AuditCandidate[] }> {
    const query = search.toLowerCase();
    return {
      items: items.filter((item) => `${item.productName} ${item.barcode ?? ""}`.toLowerCase().includes(query))
        .map((item) => ({ id: item.productId, name: item.productName, barcode: item.barcode, branchStockQty: item.systemQty })),
    };
  },
  async start(requestedBranchId) {
    session = {
      id: "fixture-audit-cendana-apr",
      branchId: requestedBranchId,
      branchName: "Cendana",
      status: "IN_PROGRESS",
      startedAt: "2025-04-30T08:00:00.000Z",
      startedByName: "Alya Pratama",
      summary: { totalProducts: items.length, counted: 0, pending: items.length, counting: 0, recountRequired: 0, excluded: 0, positiveVariance: 0, negativeVariance: 0, netVariance: 0 },
    };
    items.forEach((item) => { item.status = "PENDING"; item.inScope = true; item.variance = null; item.countedQty = null; });
    updateSummary();
    return structuredClone(session);
  },
  async beginCount(_auditId, itemId) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Produk fixture tidak ditemukan.");
    item.status = "COUNTING";
    item.baselineQty = item.systemQty;
    item.countToken = `fixture-${item.id}`;
    updateSummary();
    return { baselineQty: item.systemQty, countToken: item.countToken };
  },
  async saveCount(_auditId, itemId, input) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Produk fixture tidak ditemukan.");
    item.status = "COUNTED";
    item.countedQty = input.countedQty;
    item.variance = input.countedQty - (item.baselineQty ?? item.systemQty);
    item.finding = input.finding as AuditItem["finding"];
    item.notes = input.notes ?? "";
    item.countToken = undefined;
    updateSummary();
  },
  async reportException(_auditId, input) {
    const existing = items.find((candidate) => candidate.productId === input.productId);
    if (existing) {
      existing.status = "EXCLUDED";
      existing.inScope = false;
      existing.finding = input.finding as AuditItem["finding"];
      existing.notes = input.notes ?? "";
      existing.countedQty = input.countedQty ?? null;
    }
    updateSummary();
  },
  async finalize() {
    if (!session) return;
    session = { ...session, status: "COMPLETED", completedAt: "2025-04-30T12:00:00.000Z", completedByName: "Alya Pratama" };
  },
  async cancel() {
    if (!session) return;
    session = { ...session, status: "CANCELLED", cancelledAt: "2025-04-30T12:00:00.000Z", cancelledByName: "Alya Pratama" };
  },
};
