import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  Clock3,
  PackageCheck,
  Send,
  X,
} from "lucide-react";
import { api } from "../services/api";

type Branch = { id: string; name: string };
type Product = { id: string; name: string; barcode?: string | null; brand?: string | null; status?: string };
type Transfer = {
  id: string;
  kind: "REQUEST" | "DIRECT";
  status: "REQUESTED" | "ACCEPTED" | "IN_TRANSIT" | "RECEIVED" | "REJECTED" | "CANCELLED";
  requestedQty: number | null;
  approvedQty: number | null;
  dispatchedQty: number | null;
  receivedQty: number | null;
  requestNote?: string | null;
  responseNote?: string | null;
  discrepancyNote?: string | null;
  createdAt: string;
  product: { name: string; barcode?: string | null };
  sourceBranch: Branch;
  targetBranch: Branch;
};

type Props = {
  role: string;
  branchId?: string | null;
  branches: Branch[];
  products: Product[];
  transfers: Transfer[];
  loading?: boolean;
  error?: string;
  shiftOpen: boolean;
  onUpdated: (transfer: Transfer) => void;
};

const statusLabels: Record<Transfer["status"], string> = {
  REQUESTED: "Menunggu jawaban cabang sumber",
  ACCEPTED: "Disetujui, menunggu pengiriman",
  IN_TRANSIT: "Dalam perjalanan",
  RECEIVED: "Sudah diterima",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan sebelum dikirim",
};

const isOpen = (transfer: Transfer) =>
  ["REQUESTED", "ACCEPTED", "IN_TRANSIT"].includes(transfer.status);

export default function StockTransferActivity({
  role,
  branchId,
  branches,
  products,
  transfers,
  loading = false,
  error: loadError = "",
  shiftOpen,
  onUpdated,
}: Props) {
  const isCashier = role === "CASHIER";
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [requestQty, setRequestQty] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [acceptQty, setAcceptQty] = useState<Record<string, string>>({});
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveNotes, setReceiveNotes] = useState<Record<string, string>>({});
  const [receiveIssueOpen, setReceiveIssueOpen] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const requestableProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return products
      .filter((product) => product.status !== "INACTIVE" && product.status !== "ARCHIVED")
      .filter((product) =>
        !query ||
        product.name.toLowerCase().includes(query) ||
        String(product.barcode || "").toLowerCase().includes(query) ||
        String(product.brand || "").toLowerCase().includes(query),
      )
      .slice(0, 12);
  }, [products, productSearch]);

  const orderedTransfers = useMemo(
    () => [...transfers]
      .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 60),
    [transfers],
  );

  const run = async (id: string, action: () => Promise<Transfer>) => {
    if (busyId) return;
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const transfer = await action();
      onUpdated(transfer);
      setMessage("Perubahan transfer tersimpan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aksi transfer gagal.");
    } finally {
      setBusyId("");
    }
  };

  const submitRequest = async () => {
    if (!branchId || !sourceBranchId || !selectedProductId || !requestQty) {
      setError("Pilih cabang sumber, produk, dan jumlah permintaan.");
      return;
    }
    if (!shiftOpen) {
      setError("Buka shift terlebih dahulu untuk meminta transfer.");
      return;
    }
    const qty = Number(requestQty);
    if (!Number.isSafeInteger(qty) || qty <= 0) {
      setError("Jumlah harus bilangan bulat positif.");
      return;
    }
    await run("new-request", async () => {
      const result = await api.requestStockTransfer({
        productId: selectedProductId,
        sourceBranchId,
        qty,
        note: requestNote.trim() || undefined,
      });
      setRequestQty("");
      setRequestNote("");
      setSelectedProductId("");
      setProductSearch("");
      return result;
    });
  };

  return (
    <section className="mt-4 space-y-3 text-left" aria-label="Aktivitas transfer stok">
      {isCashier && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase text-slate-800 dark:text-slate-100">Minta stok dari cabang lain</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Cabang sumber harus menyetujui dan mengirim.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              aria-label="Cabang sumber permintaan"
              value={sourceBranchId}
              onChange={(event) => setSourceBranchId(event.target.value)}
              disabled={!shiftOpen || Boolean(busyId)}
              className="min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Pilih cabang sumber</option>
              {branches.filter((branch) => branch.id !== branchId).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <input
              value={requestQty}
              onChange={(event) => setRequestQty(event.target.value)}
              type="number"
              min="1"
              step="1"
              placeholder="Jumlah yang diminta"
              aria-label="Jumlah yang diminta"
              disabled={!shiftOpen || Boolean(busyId)}
              className="min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="relative mt-2">
            <input
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setSelectedProductId("");
              }}
              placeholder="Cari nama atau barcode produk"
              aria-label="Cari produk untuk permintaan"
              disabled={!shiftOpen || Boolean(busyId)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {productSearch && !selectedProductId && (
              <div className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                {requestableProducts.length ? requestableProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setSelectedProductId(product.id);
                      setProductSearch(product.name);
                    }}
                    className="block min-h-10 w-full border-b border-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 last:border-0 hover:bg-amber-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {product.name}
                    {product.barcode ? <span className="ml-2 text-[10px] text-slate-400">{product.barcode}</span> : null}
                  </button>
                )) : (
                  <p className="p-3 text-xs text-slate-500">Produk tidak ditemukan.</p>
                )}
              </div>
            )}
          </div>
          <input
            value={requestNote}
            onChange={(event) => setRequestNote(event.target.value)}
            maxLength={500}
            placeholder="Catatan permintaan (opsional)"
            disabled={!shiftOpen || Boolean(busyId)}
            className="mt-2 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => void submitRequest()}
            disabled={!shiftOpen || Boolean(busyId)}
            className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 text-xs font-black uppercase text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Ajukan permintaan stok
          </button>
          {!shiftOpen && <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Buka shift untuk mengajukan atau memproses transfer.</p>}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-800 dark:text-slate-100">Permintaan & penerimaan</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Stok tujuan masuk hanya setelah kasir tujuan mengonfirmasi.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{orderedTransfers.length}</span>
        </div>

        {loadError && (
          <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {loadError}
          </p>
        )}
        {(error || message) && (
          <p role={error ? "alert" : "status"} className={`mb-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold ${error ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
            {error || message}
          </p>
        )}

        {loading && orderedTransfers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700">
            Memuat daftar transfer...
          </div>
        ) : orderedTransfers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700">
            Belum ada permintaan atau pengiriman stok.
          </div>
        ) : (
          <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
            {orderedTransfers.map((transfer) => {
              const canManageSource = role !== "CASHIER" || transfer.sourceBranch.id === branchId;
              const canReceive = isCashier && transfer.targetBranch.id === branchId;
              const isBusy = busyId === transfer.id;
              const currentAcceptQty = acceptQty[transfer.id] ?? String(transfer.requestedQty ?? "");
              const currentReceiveQty = receiveQty[transfer.id] ?? String(transfer.dispatchedQty ?? "");
              const acceptQtyNumber = Number(currentAcceptQty);
              const receiveQtyNumber = Number(currentReceiveQty);
              const canSubmitAccept = Number.isSafeInteger(acceptQtyNumber) &&
                acceptQtyNumber > 0 &&
                acceptQtyNumber <= (transfer.requestedQty ?? 0);
              const canSubmitReceiptIssue = currentReceiveQty.trim() !== "" &&
                Number.isSafeInteger(receiveQtyNumber) &&
                receiveQtyNumber >= 0 &&
                receiveQtyNumber <= (transfer.dispatchedQty ?? 0) &&
                receiveQtyNumber !== transfer.dispatchedQty &&
                Boolean(receiveNotes[transfer.id]?.trim());

              return (
                <article key={transfer.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{transfer.product.name}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {transfer.sourceBranch.name} <ArrowRightLeft className="mx-1 inline h-3 w-3" /> {transfer.targetBranch.name}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${isOpen(transfer) ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                      {statusLabels[transfer.status]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {transfer.requestedQty != null && <span>Diminta {transfer.requestedQty} pcs</span>}
                    {transfer.approvedQty != null && <span>Disetujui {transfer.approvedQty} pcs</span>}
                    {transfer.dispatchedQty != null && <span>Dikirim {transfer.dispatchedQty} pcs</span>}
                    {transfer.receivedQty != null && <span>Diterima {transfer.receivedQty} pcs</span>}
                  </div>
                  {transfer.requestNote && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Catatan: {transfer.requestNote}</p>}
                  {transfer.responseNote && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Respons: {transfer.responseNote}</p>}
                  {transfer.discrepancyNote && <p className="mt-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">Selisih: {transfer.discrepancyNote}</p>}

                  {transfer.status === "REQUESTED" && canManageSource && (
                    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        Jumlah yang akan diberikan
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={currentAcceptQty}
                          onChange={(event) => setAcceptQty((state) => ({ ...state, [transfer.id]: event.target.value }))}
                          disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={Boolean(busyId) || (isCashier && !shiftOpen) || !canSubmitAccept}
                          onClick={() => void run(transfer.id, () => api.respondStockTransfer(transfer.id, {
                            action: "ACCEPT",
                            qty: Number(currentAcceptQty),
                          }))}
                          className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Setujui
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                          onClick={() => void run(transfer.id, () => api.respondStockTransfer(transfer.id, {
                            action: "REJECT",
                            note: "Stok tidak tersedia atau tidak dapat diberikan.",
                          }))}
                          className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-rose-300 px-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <X className="h-3.5 w-3.5" /> Tolak
                        </button>
                      </div>
                    </div>
                  )}

                  {transfer.status === "ACCEPTED" && canManageSource && (
                    <button
                      type="button"
                      disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                      onClick={() => void run(transfer.id, () => api.dispatchStockTransfer(transfer.id))}
                      className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 text-[10px] font-black uppercase text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
                    >
                      <Send className="h-3.5 w-3.5" /> Catat barang dikirim
                    </button>
                  )}

                  {transfer.status === "IN_TRANSIT" && canReceive && (
                    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <p className="text-[10px] text-slate-600 dark:text-slate-300">
                        Pengirim mencatat {transfer.dispatchedQty ?? 0} pcs. Konfirmasi ini menjadi bukti serah-terima cabang.
                      </p>
                      {!receiveIssueOpen[transfer.id] ? (
                        <>
                          <button
                            type="button"
                            disabled={Boolean(busyId) || !shiftOpen || transfer.dispatchedQty == null}
                            onClick={() => void run(transfer.id, () => api.receiveStockTransfer(transfer.id, {
                              receivedQty: transfer.dispatchedQty ?? 0,
                            }))}
                            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <PackageCheck className="h-4 w-4" /> Konfirmasi sesuai
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busyId) || !shiftOpen}
                            onClick={() => setReceiveIssueOpen((state) => ({ ...state, [transfer.id]: true }))}
                            className="min-h-9 w-full rounded-lg border border-amber-300 px-3 text-[10px] font-bold uppercase text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-500/10"
                          >
                            Jumlah tidak sesuai
                          </button>
                        </>
                      ) : (
                        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2 dark:border-amber-800 dark:bg-amber-500/5">
                          <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-200">
                            Jumlah yang benar-benar diterima
                            <input
                              type="number"
                              min="0"
                              max={transfer.dispatchedQty ?? undefined}
                              step="1"
                              value={currentReceiveQty}
                              onChange={(event) => setReceiveQty((state) => ({ ...state, [transfer.id]: event.target.value }))}
                              disabled={Boolean(busyId) || !shiftOpen}
                              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </label>
                          <textarea
                            value={receiveNotes[transfer.id] || ""}
                            onChange={(event) => setReceiveNotes((state) => ({ ...state, [transfer.id]: event.target.value }))}
                            maxLength={500}
                            placeholder="Jelaskan jumlah yang berbeda"
                            disabled={Boolean(busyId) || !shiftOpen}
                            className="min-h-16 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <p className="text-[10px] text-amber-900 dark:text-amber-200">
                            Selisih dicatat untuk ditelusuri. Stok pengirim tidak otomatis bertambah; retur harus diterima secara fisik.
                          </p>
                          {currentReceiveQty.trim() !== "" && receiveQtyNumber === transfer.dispatchedQty && (
                            <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                              Jumlah sama dengan yang dikirim. Gunakan “Konfirmasi sesuai”.
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={Boolean(busyId) || !shiftOpen || !canSubmitReceiptIssue}
                              onClick={() => void run(transfer.id, () => api.receiveStockTransfer(transfer.id, {
                                receivedQty: receiveQtyNumber,
                                discrepancyNote: receiveNotes[transfer.id]?.trim(),
                              }))}
                              className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 text-[10px] font-black uppercase text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                            >
                              <PackageCheck className="h-4 w-4" /> Catat selisih
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyId)}
                              onClick={() => setReceiveIssueOpen((state) => ({ ...state, [transfer.id]: false }))}
                              className="min-h-10 rounded-lg border border-slate-300 px-2 text-[10px] font-bold uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              Kembali
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isCashier && transfer.targetBranch.id === branchId &&
                    ["REQUESTED", "ACCEPTED"].includes(transfer.status) && (
                      <button
                        type="button"
                        disabled={Boolean(busyId) || !shiftOpen}
                        onClick={() => void run(transfer.id, () => api.cancelStockTransfer(transfer.id, "Dibatalkan oleh cabang peminta."))}
                        className="mt-2 min-h-9 w-full rounded-lg border border-slate-300 px-3 text-[10px] font-bold uppercase text-slate-600 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Batalkan permintaan sebelum dikirim
                      </button>
                    )}

                  {transfer.status === "IN_TRANSIT" && !canReceive && (
                    <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                      <Clock3 className="h-3.5 w-3.5" /> Menunggu konfirmasi kasir cabang tujuan.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
