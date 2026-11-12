import { Fragment, useMemo, useState } from "react";
import { Check, ChevronDown, PackageCheck, RotateCcw, Send } from "lucide-react";
import { api } from "../services/api";

type TransferStatus = "REQUESTED" | "ACCEPTED" | "IN_TRANSIT" | "RECEIVED" | "REJECTED" | "CANCELLED";
type CorrectionStatus = "PENDING_SOURCE" | "APPROVED_PENDING_RECEIPT" | "REJECTED" | "RECEIVED";
type ReceiptTransfer = {
  id: string;
  batchId?: string | null;
  kind: "REQUEST" | "DIRECT";
  status: TransferStatus;
  dispatchedQty: number | null;
  receivedQty: number | null;
  discrepancyNote?: string | null;
  createdAt: string;
  product: { id: string; name: string; barcode?: string | null };
  sourceBranch: { id: string; name: string };
  targetBranch: { id: string; name: string };
  skuCorrections?: Array<{
    id: string;
    actualProductId: string;
    actualQty: number;
    note: string;
    status: CorrectionStatus;
    responseNote?: string | null;
    actualProduct: { id: string; name: string; barcode?: string | null };
  }>;
};
type Product = {
  id: string;
  name: string;
  status?: string;
};
type IssueMode = "quantity" | "sku";
type Props = {
  batchId: string;
  items: ReceiptTransfer[];
  products: Product[];
  shiftOpen: boolean;
  confirm: (message: string) => Promise<boolean>;
  onUpdated: (transfer: ReceiptTransfer) => void;
};

const itemStatus = (transfer: ReceiptTransfer) => {
  if (transfer.status === "RECEIVED" && transfer.skuCorrections?.[0]?.status === "RECEIVED") {
    return "SKU dikoreksi";
  }
  if (transfer.status === "RECEIVED" && transfer.discrepancyNote) return "Selisih dicatat";
  if (transfer.status === "RECEIVED") return "Sudah diterima";
  const correction = transfer.skuCorrections?.[0];
  if (correction?.status === "PENDING_SOURCE") return "Menunggu pengirim";
  if (correction?.status === "APPROVED_PENDING_RECEIPT") return "Konfirmasi SKU";
  if (correction?.status === "REJECTED") return "Koreksi ditolak";
  if (transfer.status === "IN_TRANSIT") return "Menunggu penerima";
  return transfer.status;
};

export default function StockTransferBatchReceiptTable({
  batchId,
  items,
  products,
  shiftOpen,
  confirm,
  onUpdated,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [issueMode, setIssueMode] = useState<Record<string, IssueMode | undefined>>({});
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveNote, setReceiveNote] = useState<Record<string, string>>({});
  const [actualProductId, setActualProductId] = useState<Record<string, string>>({});
  const [actualQty, setActualQty] = useState<Record<string, string>>({});
  const [skuNote, setSkuNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const totalQty = useMemo(
    () => items.reduce((total, item) => total + (item.dispatchedQty ?? 0), 0),
    [items],
  );
  const canConfirmAll = items.length > 0 &&
    items.every((item) => item.status === "IN_TRANSIT") &&
    items.every((item) => !(item.skuCorrections?.length));
  const pendingCount = items.filter((item) => item.status === "IN_TRANSIT").length;
  const pendingSourceCount = items.filter((item) =>
    item.skuCorrections?.some((correction) => correction.status === "PENDING_SOURCE"),
  ).length;
  const receivedCount = items.filter((item) => item.status === "RECEIVED").length;
  const batchStatus = pendingSourceCount > 0
    ? `${pendingSourceCount} koreksi menunggu pengirim`
    : pendingCount > 0
      ? `${pendingCount} menunggu penerimaan`
      : receivedCount === items.length
        ? "Semua sudah diterima"
        : `${receivedCount} dari ${items.length} diterima`;
  const latestCreatedAt = Math.max(...items.map((item) => new Date(item.createdAt).getTime()));

  const run = async (key: string, action: () => Promise<ReceiptTransfer>) => {
    if (busyId) return;
    setBusyId(key);
    setError("");
    setMessage("");
    try {
      const updated = await action();
      onUpdated(updated);
      setIssueMode((state) => ({ ...state, [key]: undefined }));
      setMessage("Pembaruan penerimaan tersimpan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aksi penerimaan gagal.");
    } finally {
      setBusyId("");
    }
  };

  const confirmAll = async () => {
    if (!shiftOpen) {
      setError("Buka shift sebelum mengonfirmasi penerimaan.");
      return;
    }
    if (!canConfirmAll) {
      setError("Selesaikan koreksi atau penerimaan per produk terlebih dahulu.");
      return;
    }
    if (!(await confirm(`Konfirmasi semua ${items.length} produk (${totalQty} pcs) sudah sesuai?`))) return;
    if (busyId) return;
    setBusyId(batchId);
    setError("");
    setMessage("");
    try {
      const result = await api.receiveStockTransferBatch(batchId);
      for (const transfer of result.items || []) onUpdated(transfer as ReceiptTransfer);
      setMessage(`${result.items?.length || items.length} produk dalam kiriman sudah diterima.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Konfirmasi kiriman gagal.");
    } finally {
      setBusyId("");
    }
  };

  const receiveAsSent = async (transfer: ReceiptTransfer) => {
    if (!shiftOpen) {
      setError("Buka shift sebelum mengonfirmasi penerimaan.");
      return;
    }
    if (transfer.dispatchedQty == null) return;
    if (!(await confirm(`Konfirmasi ${transfer.product.name}, ${transfer.dispatchedQty} pcs, sudah sesuai?`))) return;
    void run(transfer.id, () =>
      api.receiveStockTransfer(transfer.id, { receivedQty: transfer.dispatchedQty! }),
    );
  };

  const submitQuantityIssue = (transfer: ReceiptTransfer) => {
    const qty = Number(receiveQty[transfer.id] ?? String(transfer.dispatchedQty ?? ""));
    const note = receiveNote[transfer.id]?.trim() || "";
    if (!Number.isSafeInteger(qty) || qty < 0 || qty > (transfer.dispatchedQty ?? 0) ||
        qty === transfer.dispatchedQty || !note) {
      setError("Isi jumlah aktual yang berbeda dan alasan selisih.");
      return;
    }
    void run(transfer.id, () =>
      api.receiveStockTransfer(transfer.id, { receivedQty: qty, discrepancyNote: note }),
    );
  };

  const submitSkuIssue = (transfer: ReceiptTransfer) => {
    const productId = actualProductId[transfer.id] || "";
    const qty = Number(actualQty[transfer.id] || "");
    const note = skuNote[transfer.id]?.trim() || "";
    if (!productId || !Number.isSafeInteger(qty) || qty <= 0 || !note) {
      setError("Pilih SKU aktual, isi jumlah, dan jelaskan koreksinya.");
      return;
    }
    if (!shiftOpen) {
      setError("Buka shift sebelum melaporkan koreksi SKU.");
      return;
    }
    void run(transfer.id, () => api.reportStockTransferSkuCorrection(transfer.id, {
      actualProductId: productId,
      actualQty: qty,
      note,
    }));
  };

  const confirmCorrectedSku = async (transfer: ReceiptTransfer) => {
    const correction = transfer.skuCorrections?.find(
      (item) => item.status === "APPROVED_PENDING_RECEIPT",
    );
    if (!correction) return;
    if (!(await confirm(
      `Konfirmasi ${correction.actualProduct.name}, ${correction.actualQty} pcs, benar diterima?`,
    ))) return;
    void run(transfer.id, () =>
      api.receiveStockTransferSkuCorrection(transfer.id, correction.id),
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Daftar penerimaan satu kiriman">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`transfer-receipt-details-${batchId}`}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-16 w-full flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-3 text-left hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black uppercase text-slate-800 dark:text-slate-100">
            Kiriman {batchId.slice(0, 8).toUpperCase()}
          </span>
          <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
            {items[0]?.sourceBranch.name} → {items[0]?.targetBranch.name}
            {" · "}{items.length} produk · {totalQty} pcs · {new Date(latestCreatedAt).toLocaleString("id-ID")}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold ${pendingCount
            ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
            : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>
            <PackageCheck className="h-3 w-3" /> {batchStatus}
          </span>
          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{expanded ? "Tutup" : "Detail"}</span>
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform dark:text-slate-300 ${expanded ? "rotate-180" : ""}`} />
        </span>
      </button>

      {(error || message) && (
        <p role={error ? "alert" : "status"} className={`mx-3 mt-3 rounded-lg px-2.5 py-2 text-[10px] font-semibold ${error ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
          {error || message}
        </p>
      )}

      {expanded && (
        <div id={`transfer-receipt-details-${batchId}`} className="border-t border-slate-200 dark:border-slate-700">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left text-[10px]" aria-label="Produk dalam kiriman">
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[28%]" />
          </colgroup>
          <thead className="bg-slate-100 text-[9px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-2 py-2">Produk / SKU</th>
              <th className="px-1 py-2 text-center">Kirim</th>
              <th className="px-1 py-2 text-center">Terima</th>
              <th className="px-2 py-2">Status / aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {items.map((transfer) => {
              const corrections = transfer.skuCorrections || [];
              const activeCorrection = corrections.find((correction) =>
                correction.status === "PENDING_SOURCE" || correction.status === "APPROVED_PENDING_RECEIPT",
              );
              const latestCorrection = corrections[0];
              const mode = issueMode[transfer.id];
              const alternatives = products.filter((product) =>
                product.id !== transfer.product.id &&
                product.status !== "INACTIVE" &&
                product.status !== "ARCHIVED",
              );
              const canReportSku = transfer.status === "IN_TRANSIT" &&
                !activeCorrection &&
                latestCorrection?.status !== "RECEIVED";
              const waiting = transfer.status === "IN_TRANSIT";

              return (
                <Fragment key={transfer.id}>
                  <tr className="align-top bg-white dark:bg-slate-900">
                    <td className="break-words px-2 py-2">
                      <span className="block font-bold leading-tight text-slate-800 dark:text-slate-100">
                        {transfer.product.name}
                      </span>
                      {transfer.product.barcode && (
                        <span className="mt-0.5 block truncate text-[9px] text-slate-500 dark:text-slate-400">
                          {transfer.product.barcode}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-2 text-center font-black text-slate-700 dark:text-slate-200">
                      {transfer.dispatchedQty ?? "—"}
                    </td>
                    <td className="px-1 py-2 text-center font-black text-slate-700 dark:text-slate-200">
                      {transfer.receivedQty ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`mb-1 block text-[9px] font-bold leading-tight ${waiting ? "text-amber-800 dark:text-amber-300" : "text-slate-600 dark:text-slate-300"}`}>
                        {itemStatus(transfer)}
                      </span>
                      {transfer.status === "IN_TRANSIT" && activeCorrection && (
                        <span className="block text-[9px] text-slate-500 dark:text-slate-400">
                          {activeCorrection.actualProduct.name} · {activeCorrection.actualQty} pcs
                        </span>
                      )}
                      {transfer.status === "IN_TRANSIT" && activeCorrection?.status === "APPROVED_PENDING_RECEIPT" && (
                        <button
                          type="button"
                          disabled={Boolean(busyId) || !shiftOpen}
                          onClick={() => void confirmCorrectedSku(transfer)}
                          className="mt-1 min-h-8 w-full rounded-md bg-amber-500 px-1 text-[9px] font-black text-slate-950 disabled:opacity-50"
                        >
                          Konfirmasi SKU
                        </button>
                      )}
                      {transfer.status === "IN_TRANSIT" && !activeCorrection && (
                        <div className="space-y-1">
                          {!canConfirmAll && !latestCorrection && (
                            <button
                              type="button"
                              disabled={Boolean(busyId) || !shiftOpen}
                              onClick={() => void receiveAsSent(transfer)}
                              className="min-h-8 w-full rounded-md bg-emerald-700 px-1 text-[9px] font-black text-white disabled:opacity-50 dark:bg-emerald-600"
                            >
                              Terima sesuai
                            </button>
                          )}
                          {canReportSku && (
                            <button
                              type="button"
                              disabled={Boolean(busyId) || !shiftOpen}
                              onClick={() => {
                                setIssueMode((state) => ({
                                  ...state,
                                  [transfer.id]: mode === "sku" ? undefined : "sku",
                                }));
                                setError("");
                              }}
                              className="min-h-8 w-full rounded-md border border-amber-400 px-1 text-[9px] font-bold text-amber-900 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-500/10"
                            >
                              {latestCorrection?.status === "REJECTED" ? "Koreksi ulang" : "SKU berbeda"}
                            </button>
                          )}
                          {!latestCorrection && (
                            <button
                              type="button"
                              disabled={Boolean(busyId) || !shiftOpen}
                              onClick={() => {
                                setIssueMode((state) => ({
                                  ...state,
                                  [transfer.id]: mode === "quantity" ? undefined : "quantity",
                                }));
                                setError("");
                              }}
                              className="min-h-8 w-full rounded-md border border-slate-300 px-1 text-[9px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Jumlah beda
                            </button>
                          )}
                        </div>
                      )}
                      {transfer.discrepancyNote && (
                        <span className="mt-1 block break-words text-[9px] text-amber-800 dark:text-amber-300">
                          {transfer.discrepancyNote}
                        </span>
                      )}
                    </td>
                  </tr>
                  {mode && (
                    <tr className="bg-amber-50/70 dark:bg-amber-500/5">
                      <td colSpan={4} className="px-2 py-2.5">
                        {mode === "quantity" ? (
                          <div className="space-y-2">
                            <p className="font-bold text-slate-800 dark:text-slate-100">Catat jumlah yang benar-benar diterima</p>
                            <input
                              type="number"
                              min="0"
                              max={transfer.dispatchedQty ?? undefined}
                              step="1"
                              value={receiveQty[transfer.id] ?? String(transfer.dispatchedQty ?? "")}
                              onChange={(event) => setReceiveQty((state) => ({ ...state, [transfer.id]: event.target.value }))}
                              aria-label={`Jumlah diterima ${transfer.product.name}`}
                              disabled={Boolean(busyId) || !shiftOpen}
                              className="min-h-9 w-full rounded-lg border border-amber-300 bg-white px-2 text-xs text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <textarea
                              value={receiveNote[transfer.id] || ""}
                              onChange={(event) => setReceiveNote((state) => ({ ...state, [transfer.id]: event.target.value }))}
                              maxLength={500}
                              placeholder="Alasan jumlah berbeda"
                              aria-label={`Alasan selisih ${transfer.product.name}`}
                              disabled={Boolean(busyId) || !shiftOpen}
                              className="min-h-14 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <p className="text-[9px] text-amber-900 dark:text-amber-200">
                              Stok pengirim tidak otomatis kembali. Retur fisik harus dikonfirmasi terpisah.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={Boolean(busyId) || !shiftOpen}
                                onClick={() => submitQuantityIssue(transfer)}
                                className="min-h-9 rounded-lg bg-amber-500 px-2 text-[10px] font-black text-slate-950 disabled:opacity-50"
                              >
                                Simpan selisih
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(busyId)}
                                onClick={() => setIssueMode((state) => ({ ...state, [transfer.id]: undefined }))}
                                className="min-h-9 rounded-lg border border-slate-300 px-2 text-[10px] font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="font-bold text-slate-800 dark:text-slate-100">
                              Laporkan SKU yang tercatat berbeda; stok menunggu persetujuan pengirim.
                            </p>
                            <select
                              value={actualProductId[transfer.id] || ""}
                              onChange={(event) => setActualProductId((state) => ({ ...state, [transfer.id]: event.target.value }))}
                              aria-label={`SKU aktual ${transfer.product.name}`}
                              disabled={Boolean(busyId) || !shiftOpen}
                              className="min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <option value="">Pilih SKU yang diterima</option>
                              {alternatives.map((product) => (
                                <option key={product.id} value={product.id}>{product.name}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={actualQty[transfer.id] || ""}
                              onChange={(event) => setActualQty((state) => ({ ...state, [transfer.id]: event.target.value }))}
                              placeholder="Jumlah SKU aktual"
                              aria-label={`Jumlah SKU aktual ${transfer.product.name}`}
                              disabled={Boolean(busyId) || !shiftOpen}
                              className="min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <textarea
                              value={skuNote[transfer.id] || ""}
                              onChange={(event) => setSkuNote((state) => ({ ...state, [transfer.id]: event.target.value }))}
                              maxLength={500}
                              placeholder="Alasan koreksi SKU"
                              aria-label={`Alasan koreksi SKU ${transfer.product.name}`}
                              disabled={Boolean(busyId) || !shiftOpen}
                              className="min-h-14 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                            />
                            {latestCorrection?.status === "REJECTED" && latestCorrection.responseNote && (
                              <p className="text-[9px] font-semibold text-rose-700 dark:text-rose-300">
                                Koreksi sebelumnya ditolak: {latestCorrection.responseNote}
                              </p>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={Boolean(busyId) || !shiftOpen}
                                onClick={() => submitSkuIssue(transfer)}
                                className="flex min-h-9 items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 text-[10px] font-black text-slate-950 disabled:opacity-50"
                              >
                                <Send className="h-3 w-3" /> Kirim koreksi
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(busyId)}
                                onClick={() => setIssueMode((state) => ({ ...state, [transfer.id]: undefined }))}
                                className="min-h-9 rounded-lg border border-slate-300 px-2 text-[10px] font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  {activeCorrection?.status === "PENDING_SOURCE" && (
                    <tr className="bg-amber-50/40 dark:bg-amber-500/5">
                      <td colSpan={4} className="px-2 py-1.5 text-[9px] text-slate-600 dark:text-slate-300">
                        Catatan koreksi: {activeCorrection.note}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/80">
        <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
          Total kiriman: <strong>{items.length} produk · {totalQty} pcs</strong>
        </p>
        {canConfirmAll ? (
          <button
            type="button"
            disabled={Boolean(busyId) || !shiftOpen}
            onClick={() => void confirmAll()}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 text-[10px] font-black uppercase text-slate-950 hover:bg-amber-400 disabled:opacity-50 sm:w-auto"
          >
            <Check className="h-4 w-4" />
            {busyId === batchId ? "Menyimpan..." : "Konfirmasi semua sesuai"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-800 dark:text-amber-300">
            <RotateCcw className="h-3 w-3" /> Selesaikan baris yang tertunda satu per satu.
          </span>
        )}
      </footer>
      {!shiftOpen && (
        <p className="px-3 pb-3 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
          Buka shift sebelum mengonfirmasi penerimaan.
        </p>
      )}
        </div>
      )}
    </section>
  );
}
