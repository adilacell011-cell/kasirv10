import { clearPendingSaleKey, getPendingSaleKey } from "./sale-idempotency";

const BASE_URL = "/api";

const getHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}-${Math.random()}`;
}

export class ReadError extends Error {
  constructor(
    public readonly kind: "http" | "network" | "invalid-response",
    public readonly status?: number,
    public readonly serverError?: string,
  ) {
    super(kind === "network" ? "Koneksi gagal: Failed to fetch" :
      kind === "invalid-response" ? "Format respons tidak valid" : `Gagal memuat data (HTTP ${status})`);
    this.name = "ReadError";
  }
}

export const isSessionError = (error: unknown) => error instanceof ReadError &&
  (error.status === 401 || (error.status === 403 && error.serverError === "Invalid or expired token"));

async function readJsonWithResponse(path: string, signal?: AbortSignal): Promise<{ data: any; response: Response }> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { headers: getHeaders(), signal });
  } catch (error) {
    if (signal?.aborted || (error as Error)?.name === "AbortError") throw error;
    throw new ReadError("network");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ReadError("http", response.status, typeof body.error === "string" ? body.error : undefined);
  }
  try {
    return { data: await response.json(), response };
  } catch (error) {
    if (signal?.aborted || (error as Error)?.name === "AbortError") throw error;
    throw new ReadError("invalid-response", response.status);
  }
}

async function readJson(path: string, signal?: AbortSignal): Promise<any> {
  return (await readJsonWithResponse(path, signal)).data;
}

async function writeJson(path: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : `Permintaan gagal (HTTP ${response.status}).`);
  }
  return result;
}

// One read cycle at a time. Events arriving DURING a read require a trailing
// cycle, so reconnects cannot lose changes made after the HTTP snapshot.
export function createReadRefresh(run: () => Promise<void>, delay = 150) {
  let disposed = false;
  let busy = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  const schedule = () => {
    if (disposed) return;
    if (busy) { queued = true; return; }
    if (timer) return;
    timer = setTimeout(async () => {
      timer = undefined;
      if (disposed) return;
      busy = true;
      const batch = waiting;
      waiting = [];
      try {
        await run();
        batch.forEach(({ resolve }) => resolve());
      } catch (error) {
        batch.forEach(({ reject }) => reject(error));
        if (!batch.length) console.error("Read refresh error:", error);
      } finally {
        busy = false;
        if (!disposed && (queued || waiting.length)) {
          queued = false;
          schedule();
        }
      }
    }, delay);
  };
  return {
    schedule,
    refresh: () => disposed ? Promise.resolve() : new Promise<void>((resolve, reject) => {
      waiting.push({ resolve, reject });
      schedule();
    }),
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      waiting.forEach(({ resolve }) => resolve());
      waiting = [];
    },
  };
}

export const api = {
  async login(credentials: any) {
    let res;
    try {
      res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    } catch (e: any) {
      throw new Error("Network Error: " + e.message);
    }
    
    if (!res.ok) {
      let errTxt = "";
      try {
        errTxt = await res.text();
        const errObj = JSON.parse(errTxt);
        throw new Error(errObj.error || "Login gagal");
      } catch (e: any) {
        if (e.message.includes("Login gagal") || (errTxt && errTxt.includes("error"))) {
            throw e; // rethrow the actual parsed error
        }
        throw new Error(`Login error ${res.status}: ` + errTxt);
      }
    }
    const data = await res.json();
    localStorage.setItem("token", data.token);
    // Add uid for compatibility
    if (data.user) data.user.uid = data.user.id;
    return data;
  },

  async register(data: any) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Registration failed");
    }
    const result = await res.json();
    if (result) result.uid = result.id;
    return result;
  },

  async getMe(signal?: AbortSignal) {
    const data = await readJson("/auth/me", signal);
    if (data) data.uid = data.id;
    return data;
  },

  async getProducts(signal?: AbortSignal) {
    return readJson("/products", signal);
  },

  async getInactiveProducts(signal?: AbortSignal) {
    const products = await readJson("/products/inactive", signal);
    return (products || []).map((product: any) => ({
      ...product,
      stocks: Object.fromEntries(
        (product.stocks || []).map((stock: any) => [stock.branchId, stock.qty]),
      ),
      stockBranches: product.stocks || [],
    }));
  },

  async deactivateProduct(id: string) {
    const res = await fetch(`${BASE_URL}/products/${encodeURIComponent(id)}/deactivate`, {
      method: "POST",
      headers: getHeaders(),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const remaining = Array.isArray(payload.stocks)
        ? payload.stocks
            .map((stock: any) => `${stock.branchName}: ${stock.qty} pcs`)
            .join(", ")
        : "";
      throw new Error(
        [payload.error || `Gagal menonaktifkan produk (${res.status}).`, remaining].filter(Boolean).join(" "),
      );
    }
    return res.json();
  },

  async reactivateProduct(id: string) {
    const res = await fetch(`${BASE_URL}/products/${encodeURIComponent(id)}/reactivate`, {
      method: "POST",
      headers: getHeaders(),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || `Gagal mengaktifkan kembali produk (${res.status}).`);
    }
    return res.json();
  },

  async createProduct(data: any) {
    const res = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to create product: ${res.status} ${txt}`); }
    return res.json();
  },

  async deleteProduct(id: string) {
    const res = await fetch(`${BASE_URL}/products/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to delete product: ${res.status} ${txt}`); }
    return res.json();
  },

  async adjustStock(data: any) {
    const res = await fetch(`${BASE_URL}/stocks/adjust`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = new Error(body.error || `Failed to adjust stock: ${res.status}`);
      Object.assign(error, { status: res.status, code: body.code });
      throw error;
    }
    return res.json();
  },

  async transferStock(data: any) {
    return writeJson("/stocks/transfer", "POST", data);
  },

  async transferStockBatch(data: {
    sourceBranchId?: string;
    targetBranchId: string;
    items: Array<{ productId: string; qty: number }>;
    note?: string;
  }) {
    return writeJson("/stocks/transfer-batch", "POST", data);
  },

  async getStockTransfers(
    params: { branchId?: string; status?: string; limit?: number } = {},
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams();
    if (params.branchId) query.set("branchId", params.branchId);
    if (params.status) query.set("status", params.status);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.size ? `?${query.toString()}` : "";
    return readJson(`/stock-transfers${suffix}`, signal);
  },

  async requestStockTransfer(data: {
    productId: string;
    sourceBranchId: string;
    targetBranchId?: string;
    qty: number;
    note?: string;
  }) {
    return writeJson("/stock-transfers/requests", "POST", data);
  },

  async respondStockTransfer(
    id: string,
    data: { action: "ACCEPT" | "REJECT"; qty?: number; note?: string },
  ) {
    return writeJson(`/stock-transfers/${encodeURIComponent(id)}/respond`, "PATCH", data);
  },

  async dispatchStockTransfer(id: string) {
    return writeJson(`/stock-transfers/${encodeURIComponent(id)}/dispatch`, "POST", {});
  },

  async receiveStockTransfer(
    id: string,
    data: { receivedQty: number; discrepancyNote?: string },
  ) {
    return writeJson(`/stock-transfers/${encodeURIComponent(id)}/receive`, "POST", data);
  },

  async receiveStockTransferBatch(batchId: string) {
    return writeJson(
      `/stock-transfers/batches/${encodeURIComponent(batchId)}/receive`,
      "POST",
      {},
    );
  },

  async reportStockTransferSkuCorrection(
    id: string,
    data: { actualProductId: string; actualQty: number; note: string },
  ) {
    return writeJson(`/stock-transfers/${encodeURIComponent(id)}/sku-corrections`, "POST", data);
  },

  async reviewStockTransferSkuCorrection(
    id: string,
    correctionId: string,
    data: { action: "APPROVE" | "REJECT"; responseNote?: string },
  ) {
    return writeJson(
      `/stock-transfers/${encodeURIComponent(id)}/sku-corrections/${encodeURIComponent(correctionId)}`,
      "PATCH",
      data,
    );
  },

  async receiveStockTransferSkuCorrection(id: string, correctionId: string) {
    return writeJson(
      `/stock-transfers/${encodeURIComponent(id)}/sku-corrections/${encodeURIComponent(correctionId)}/receive`,
      "POST",
      {},
    );
  },

  async cancelStockTransfer(id: string, note?: string) {
    return writeJson(`/stock-transfers/${encodeURIComponent(id)}/cancel`, "PATCH", { note });
  },

  async getBranches(signal?: AbortSignal) {
    return readJson("/branches", signal);
  },

  async getTransferTargetBranches(signal?: AbortSignal) {
    return readJson("/branches/transfer-targets", signal);
  },

  async createSale(data: any, idempotencyKey?: string) {
    let pending: { key: string; storageKey: string | null };
    let pendingStore: Storage | null = null;
    try {
      pendingStore = localStorage;
      pending = getPendingSaleKey(data, pendingStore, newIdempotencyKey, idempotencyKey);
    } catch {
      pending = { key: newIdempotencyKey(), storageKey: null };
    }
    const res = await fetch(`${BASE_URL}/transactions`, {
      method: "POST",
      headers: { ...getHeaders(), "X-Idempotency-Key": pending.key },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status < 500 && res.status !== 409) {
        if (pendingStore) clearPendingSaleKey(pendingStore, pending.storageKey, pending.key);
      }
      throw new Error(`Failed to create sale: ${res.status} ${txt}`);
    }
    const sale = await res.json();
    if (pendingStore) clearPendingSaleKey(pendingStore, pending.storageKey, pending.key);
    return sale;
  },

  async getSales(params: any = {}, signal?: AbortSignal) {
    const allSales: any[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    do {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          queryParams.set(key, String(value));
        }
      });
      queryParams.set("limit", "100");
      if (cursor) queryParams.set("cursor", cursor);

      const { data } = await readJsonWithResponse(`/transactions?${queryParams}`, signal);
      if (!data || !Array.isArray(data.items) ||
          !(data.nextCursor === null || typeof data.nextCursor === "string")) {
        throw new ReadError("invalid-response");
      }
      allSales.push(...data.items);

      if (data.nextCursor === null) {
        cursor = null;
      } else {
        if (seenCursors.has(data.nextCursor) || data.items.length === 0) {
          throw new ReadError("invalid-response");
        }
        seenCursors.add(data.nextCursor);
        cursor = data.nextCursor;
      }
    } while (cursor !== null);

    return allSales;
  },

  async getProductSalesQuantities(branchId?: string, signal?: AbortSignal) {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    return readJson(`/products/sales-quantities${query}`, signal);
  },

  async getCommissions(params: any = {}, signal?: AbortSignal) {
    const query = new URLSearchParams(params).toString();
    return readJson(`/incentives?${query}`, signal);
  },

  async getShifts(params: any = {}, signal?: AbortSignal) {
    const query = new URLSearchParams(params).toString();
    return readJson(`/shifts?${query}`, signal);
  },

  async getShiftCloseSummary(id: string, signal?: AbortSignal) {
    return readJson(`/shifts/${encodeURIComponent(id)}/close-summary`, signal);
  },

  async openShift(data: any) {
    const res = await fetch(`${BASE_URL}/shifts`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to open shift: ${res.status} ${txt}`); }
    return res.json();
  },

  async updateShift(id: string, data: any) {
    const res = await fetch(`${BASE_URL}/shifts/${id}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to update shift: ${res.status} ${txt}`); }
    return res.json();
  },

  async getUsers(signal?: AbortSignal) {
    const data = await readJson("/users", signal);
    return data.map((u: any) => ({ ...u, uid: u.id }));
  },

  async updateUser(id: string, data: any) {
    const res = await fetch(`${BASE_URL}/users/${id}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to update user: ${res.status} ${txt}`); }
    const result = await res.json();
    if (result) result.uid = result.id;
    return result;
  },

  async deleteUser(id: string) {
    const res = await fetch(`${BASE_URL}/users/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to delete user: ${res.status} ${txt}`); }
    return res.json();
  },

  async getHealth() {
    return readJson("/health");
  },
  
  async refundSale(id: string) {
    const res = await fetch(`${BASE_URL}/transactions/${id}/refund`, {
      method: "POST",
      headers: getHeaders(),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to refund sale");
    }
    return res.json();
  },

  async withdrawCommission(branchId: string) {
    const res = await fetch(`${BASE_URL}/incentives/withdraw`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ branchId }),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to withdraw commissions: ${res.status} ${txt}`); }
    return res.json();
  },

  async getCommissionSummary(branchId?: string, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (branchId) params.append("branchId", branchId);
    return readJson(`/incentives/summary?${params.toString()}`, signal);
  },

  async getAdjustments(signal?: AbortSignal) {
    return readJson("/adjustments", signal);
  },

  async cleanupAdjustments() {
    const res = await fetch(`${BASE_URL}/adjustments/cleanup`, {
        method: "POST",
        headers: getHeaders(),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to cleanup adjustments: ${res.status} ${txt}`); }
    return res.json();
  },

  async getDailySummaries(signal?: AbortSignal) {
    return readJson("/daily-summaries", signal);
  },

  async getOwnerDashboard(branchId = "", signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    return readJson(`/owner-dashboard?${params}`, signal);
  },

  async getOwnerDashboardDetails(branchId = "", signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    return readJson(`/owner-dashboard/details?${params}`, signal);
  },

  async getStockAuditCurrent(branchId: string, signal: AbortSignal) {
    const params = new URLSearchParams({ branchId });
    return readJson(`/stock-audits/current?${params}`, signal);
  },

  async getStockAuditItems(
    auditId: string,
    params: { page: number; pageSize: number; search?: string; status?: string },
    signal: AbortSignal,
  ) {
    const query = new URLSearchParams({
      auditId,
      page: String(params.page),
      pageSize: String(params.pageSize),
    });
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    return readJson(`/stock-audits/items?${query}`, signal);
  },

  async searchStockAuditCandidates(auditId: string, search: string, signal: AbortSignal) {
    const params = new URLSearchParams({ auditId, search });
    return readJson(`/stock-audits/candidates?${params}`, signal);
  },

  async startStockAudit(branchId: string) {
    return writeJson("/stock-audits", "POST", { branchId });
  },

  async beginStockAuditCount(auditId: string, itemId: string) {
    return writeJson("/stock-audits/begin-count", "POST", { auditId, itemId });
  },

  async saveStockAuditCount(
    auditId: string,
    itemId: string,
    data: { countedQty: number; finding: string; notes?: string; countToken: string },
  ) {
    return writeJson("/stock-audits/count", "PATCH", { auditId, itemId, ...data });
  },

  async reportStockAuditException(
    auditId: string,
    data: { productId: string; finding: string; notes?: string; countedQty?: number },
  ) {
    return writeJson("/stock-audits/exceptions", "POST", { auditId, ...data });
  },

  async revokeStockAuditProductVisibility(
    data: { auditId: string; productId: string; reason: string },
  ) {
    return writeJson("/stock-audits/revoke-product-visibility", "POST", data);
  },

  async finalizeStockAudit(auditId: string) {
    return writeJson("/stock-audits/finalize", "POST", { auditId });
  },

  async cancelStockAudit(auditId: string) {
    return writeJson("/stock-audits/cancel", "POST", { auditId });
  },

  async getShoppingPlans(signal?: AbortSignal) {
    return readJson("/shopping-plans", signal);
  },

  async createShoppingPlan(data: any) {
    const res = await fetch(`${BASE_URL}/shopping-plans`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to create shopping plan: ${res.status} ${txt}`); }
    return res.json();
  },

  async deleteShoppingPlan(id: string) {
    const res = await fetch(`${BASE_URL}/shopping-plans/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Failed to delete shopping plan: ${res.status} ${txt}`); }
    return res.json();
  }
};
